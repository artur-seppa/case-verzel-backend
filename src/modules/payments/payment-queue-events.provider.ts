import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { QueueEvents } from 'bullmq';
import type { Redis } from 'ioredis';
import { PAYMENTS_QUEUE_NAME } from '../../shared/infra/queue/payments-queue.constants';
import { REDIS_CONNECTION } from '../../shared/infra/redis/redis-connection.token';

@Injectable()
export class PaymentQueueEventsProvider
  extends QueueEvents
  implements OnApplicationShutdown
{
  constructor(@Inject(REDIS_CONNECTION) connection: Redis) {
    super(PAYMENTS_QUEUE_NAME, { connection });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }
}
