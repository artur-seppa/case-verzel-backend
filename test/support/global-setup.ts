import { config } from 'dotenv';

config({ path: '.env.test' });

import { ensureDatabaseExists } from './create-test-database';

export default async function globalSetup() {
  const testUrl = new URL(process.env.DATABASE_URL!);
  const dbName = testUrl.pathname.slice(1);
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';

  await ensureDatabaseExists(adminUrl.toString(), dbName);

  const { AppDataSource } =
    await import('../../src/shared/infra/database/data-source.js');
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();
  await AppDataSource.destroy();
}
