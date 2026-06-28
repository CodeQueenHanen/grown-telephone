import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';
import { getTable } from '../lib/tableClient';

const CONTAINER = 'drawings';

async function submitDrawing(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
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

    const game = await games.getEntity<{ phase: string; round: number; playerCount: number }>('game', gameId);

    if (game.phase !== 'active') {
        return { status: 409, jsonBody: { error: 'game not active' } };
    }

    const player = await players.getEntity<{ order: number }>(gameId, playerId);

    if (player.order !== game.round) {
        return { status: 409, jsonBody: { error: 'not your turn' } };
    }

    const cs = process.env.STORAGE_CONNECTION_STRING!;
    const container = BlobServiceClient.fromConnectionString(cs).getContainerClient(CONTAINER);
    await container.createIfNotExists({ access: 'blob' });

    const blobName = `${gameId}/${String(game.round).padStart(4, '0')}.png`;
    const blob = container.getBlockBlobClient(blobName);
    const data = await request.arrayBuffer();
    await blob.uploadData(data, { blobHTTPHeaders: { blobContentType: 'image/png' } });

    const blobUrl = blob.url;
    const rowKey = String(game.round).padStart(4, '0');
    await chain.upsertEntity({ partitionKey: gameId, rowKey, type: 'drawing', content: blobUrl, playerId });

    const nextRound = game.round + 1;
    const newPhase = nextRound >= game.playerCount ? 'reveal' : 'active';
    await games.updateEntity({ partitionKey: 'game', rowKey: gameId, round: nextRound, phase: newPhase }, 'Merge');

    return { status: 200, jsonBody: { blobUrl } };
}

app.http('submitDrawing', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: submitDrawing,
});
