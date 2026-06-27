import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

async function submitText(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    return { status: 200, jsonBody: { ok: true } };
}

app.http('submitText', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: submitText,
});
