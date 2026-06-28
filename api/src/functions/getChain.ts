import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getTable } from '../lib/tableClient';

async function getChain(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const gameId = request.query.get('gameId');

    if (!gameId) {
        return { status: 400, jsonBody: { error: 'gameId required' } };
    }

    const chain = await getTable('chain');

    const entries: { round: number; type: string; content: string }[] = [];

    for await (const entity of chain.listEntities<{ type: string; content: string }>({
        queryOptions: { filter: `PartitionKey eq '${gameId}'` },
    })) {
        entries.push({
            round: parseInt(entity.rowKey!, 10),
            type: entity.type,
            content: entity.content,
        });
    }

    entries.sort((a, b) => a.round - b.round);

    return { status: 200, jsonBody: { entries } };
}

app.http('getChain', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getChain,
});
