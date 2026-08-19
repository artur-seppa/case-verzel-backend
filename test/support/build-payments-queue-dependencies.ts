import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PAYMENTS_QUEUE_NAME } from '../../src/shared/infra/queue/payments-queue.constants';

export function buildTestPaymentsQueue() {
  const connection = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
  });
  const queue = new Queue(PAYMENTS_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    },
  });

  async function close(): Promise<void> {
    await queue.close();
    await connection.quit();
  }

  return { queue, connection, close };
}
