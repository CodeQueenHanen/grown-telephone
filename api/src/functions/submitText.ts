import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getTable } from '../lib/tableClient';

async function submitText(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const gameId = request.query.get('gameId');
    const playerId = request.query.get('playerId');

    if (!gameId || !playerId) {
        return { status: 400, jsonBody: { error: 'gameId and playerId required' } };
    }

    const body = await request.json() as { text?: string };
    if (!body?.text) {
        return { status: 400, jsonBody: { error: 'text required' } };
    }

    const [games, players, chain] = await Promise.all([
        getTable('games'),
        getTable('players'),
        getTable('chain'),
    ]);

    const game = await games.getEntity<{ phase: string; round: number; playerCount: number }>('game', gameId);

    if (game.phase !== 'active') {
        return { status: 409, jsonBody: { error: 'game not active' } };
    }

    const player = await players.getEntity<{ order: number }>(gameId, playerId);

    if (player.order !== game.round) {
        return { status: 409, jsonBody: { error: 'not your turn' } };
    }

    const rowKey = String(game.round).padStart(4, '0');
    await chain.upsertEntity({ partitionKey: gameId, rowKey, type: 'text', content: body.text, playerId });

    const nextRound = game.round + 1;
    const newPhase = nextRound >= game.playerCount ? 'reveal' : 'active';
    await games.updateEntity({ partitionKey: 'game', rowKey: gameId, round: nextRound, phase: newPhase }, 'Merge');

    return { status: 200, jsonBody: { ok: true } };
}

app.http('submitText', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: submitText,
});
