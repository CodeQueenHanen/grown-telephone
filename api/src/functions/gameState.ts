import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

async function gameState(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    return { status: 200, jsonBody: { round: 0, phase: 'lobby', playerCount: 0 } };
}

app.http('gameState', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: gameState,
});
