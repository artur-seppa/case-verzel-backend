import { Client } from 'pg';

export async function ensureDatabaseExists(
  adminUrl: string,
  dbName: string,
): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();

  const result = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [dbName],
  );

  if (result.rowCount === 0) {
    await client.query(`CREATE DATABASE "${dbName}"`);
  }

  await client.end();
}
