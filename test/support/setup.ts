import { config } from 'dotenv';

config({ path: '.env.test' });

import { afterEach } from 'vitest';
import Redis from 'ioredis';
import { resetDatabase } from './test-data-source';

const testRedis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
  lazyConnect: true,
});

afterEach(async () => {
  await resetDatabase();
  try {
    await testRedis.flushdb();
  } catch {
    testRedis.disconnect();
  }
});
