import { describe, expect, it } from 'vitest';
import Redis from 'ioredis';

describe('Redis test connection', () => {
  it('connects to REDIS_URL and responds to PING', async () => {
    const redis = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
    });
    try {
      await expect(redis.ping()).resolves.toBe('PONG');
    } finally {
      await redis.quit();
    }
  });
});
