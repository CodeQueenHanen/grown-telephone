import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getTable } from '../lib/tableClient';

async function getTask(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const gameId = request.query.get('gameId');
    const playerId = request.query.get('playerId');

    if (!gameId || !playerId) {
        return { status: 400, jsonBody: { error: 'gameId and playerId required' } };
    }

    const [games, players, chain] = await Promise.all([
        getTable('games'),
        getTable('players'),
        getTable('chain'),
    ]);

    let game: { phase: string; round: number; playerCount: number };
    try {
        const entity = await games.getEntity<{ phase: string; round: number; playerCount: number }>('game', gameId);
        game = { phase: entity.phase, round: entity.round, playerCount: entity.playerCount };
    } catch {
        return { status: 404, jsonBody: { error: 'game not found' } };
    }

    if (game.phase === 'reveal') {
        return { status: 200, jsonBody: { type: 'reveal' } };
    }
    if (game.phase !== 'active') {
        return { status: 200, jsonBody: { type: 'wait' } };
    }

    let playerOrder: number;
    try {
        const entity = await players.getEntity<{ order: number }>(gameId, playerId);
        playerOrder = entity.order;
    } catch {
        return { status: 404, jsonBody: { error: 'player not found' } };
    }

    if (playerOrder !== game.round) {
        return { status: 200, jsonBody: { type: 'wait' } };
    }

    if (game.round === 0) {
        return { status: 200, jsonBody: { type: 'write', prompt: '' } };
    }

    const prevKey = String(game.round - 1).padStart(4, '0');
    let prev: { type: string; content: string };
    try {
        const entity = await chain.getEntity<{ type: string; content: string }>(gameId, prevKey);
        prev = { type: entity.type, content: entity.content };
    } catch {
        return { status: 500, jsonBody: { error: 'chain gap' } };
    }

    if (prev.type === 'text') {
        return { status: 200, jsonBody: { type: 'draw', prompt: prev.content } };
    }
    return { status: 200, jsonBody: { type: 'guess', blobUrl: prev.content } };
}

app.http('getTask', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getTask,
});
