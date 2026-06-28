import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { RestError } from '@azure/data-tables';
import { getTable } from '../lib/tableClient';

async function gameState(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const gameId = request.query.get('gameId');
    const playerId = request.query.get('playerId');

    if (!gameId || !playerId) {
        return { status: 400, jsonBody: { error: 'gameId and playerId required' } };
    }

    const [games, players] = await Promise.all([getTable('games'), getTable('players')]);

    let phase: string;
    let round: number;
    let playerCount: number;

    try {
        const entity = await games.getEntity<{ phase: string; round: number; playerCount: number }>('game', gameId);
        phase = entity.phase;
        round = entity.round;
        playerCount = entity.playerCount;
    } catch {
        phase = 'lobby';
        round = 0;
        playerCount = 0;
        await games.createEntity({ partitionKey: 'game', rowKey: gameId, phase, round, playerCount });
    }

    // Idempotent join: 409 means already registered, which is fine
    if (phase === 'lobby') {
        try {
            await players.createEntity({ partitionKey: gameId, rowKey: playerId, joinedAt: Date.now(), order: -1 });
        } catch (e) {
            if (!(e instanceof RestError) || e.statusCode !== 409) throw e;
        }
    }

    // Count from the table — avoids race conditions with a stored counter
    const allPlayers: Array<{ rowKey?: string; joinedAt?: number }> = [];
    for await (const p of players.listEntities<{ joinedAt?: number }>({
        queryOptions: { filter: `PartitionKey eq '${gameId}'` },
    })) {
        allPlayers.push(p);
    }
    playerCount = allPlayers.length;

    allPlayers.sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));
    const myOrder = allPlayers.findIndex(p => p.rowKey === playerId);

    // Assign orders by join time and flip to active
    if (request.query.get('start') === 'true' && phase === 'lobby' && playerCount >= 2) {
        await Promise.all(
            allPlayers.map((p, i) =>
                players.updateEntity({ partitionKey: gameId, rowKey: p.rowKey!, order: i }, 'Merge')
            )
        );
        phase = 'active';
        await games.updateEntity({ partitionKey: 'game', rowKey: gameId, phase, playerCount }, 'Merge');
    }

    return { status: 200, jsonBody: { round, phase, playerCount, myOrder } };
}

app.http('gameState', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: gameState,
});
