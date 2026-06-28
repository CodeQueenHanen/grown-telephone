import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
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

    try {
        await players.getEntity(gameId, playerId);
    } catch {
        const order = playerCount;
        await players.createEntity({ partitionKey: gameId, rowKey: playerId, order });
        playerCount += 1;
        await games.updateEntity({ partitionKey: 'game', rowKey: gameId, playerCount }, 'Merge');
    }

    if (request.query.get('start') === 'true' && phase === 'lobby' && playerCount >= 2) {
        phase = 'active';
        await games.updateEntity({ partitionKey: 'game', rowKey: gameId, phase }, 'Merge');
    }

    return { status: 200, jsonBody: { round, phase, playerCount } };
}

app.http('gameState', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: gameState,
});
