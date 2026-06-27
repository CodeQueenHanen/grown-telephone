import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

async function submitDrawing(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    return { status: 200, jsonBody: { blobUrl: '' } };
}

app.http('submitDrawing', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: submitDrawing,
});
