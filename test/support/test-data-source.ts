import { AppDataSource } from '../../src/shared/infra/database/data-source';

let ready: Promise<typeof AppDataSource> | null = null;

export function getTestDataSource() {
  ready ??= AppDataSource.initialize();
  return ready;
}

export async function resetDatabase(): Promise<void> {
  const dataSource = await getTestDataSource();

  const tables: Array<{ tablename: string }> = await dataSource.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'migrations'`,
  );

  if (tables.length === 0) return;

  const names = tables.map((t) => `"${t.tablename}"`).join(', ');
  await dataSource.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}
