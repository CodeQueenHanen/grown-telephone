import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

async function getTask(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    return { status: 200, jsonBody: { type: 'text', prompt: '' } };
}

app.http('getTask', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getTask,
});
