import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type {
  EnqueueChargeInput,
  PaymentQueueService,
} from '../../domain/services/payment-queue.service';
import { PAYMENTS_QUEUE_NAME } from './payments-queue.constants';

@Injectable()
export class BullMqPaymentQueueService implements PaymentQueueService {
  constructor(
    @InjectQueue(PAYMENTS_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  async enqueueCharge(input: EnqueueChargeInput): Promise<void> {
    await this.queue.add('charge-reservation', input, {
      jobId: input.reservationId,
    });
  }
}
