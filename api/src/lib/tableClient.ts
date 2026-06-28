import { TableClient, RestError } from '@azure/data-tables';

const cs = process.env.STORAGE_CONNECTION_STRING!;

export async function getTable(name: string): Promise<TableClient> {
    const client = TableClient.fromConnectionString(cs, name);
    try {
        await client.createTable();
    } catch (e) {
        if (!(e instanceof RestError) || e.statusCode !== 409) throw e;
    }
    return client;
}
