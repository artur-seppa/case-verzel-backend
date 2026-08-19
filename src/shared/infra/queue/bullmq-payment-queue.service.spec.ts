import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { buildTestPaymentsQueue } from '../../../../test/support/build-payments-queue-dependencies';
import { BullMqPaymentQueueService } from './bullmq-payment-queue.service';

describe('BullMqPaymentQueueService', () => {
  const { queue, close } = buildTestPaymentsQueue();
  const service = new BullMqPaymentQueueService(queue);

  afterEach(async () => {
    await queue.obliterate({ force: true });
  });

  afterAll(async () => {
    await close();
  });

  it('enqueues a charge job keyed by reservationId', async () => {
    await service.enqueueCharge({
      reservationId: 'res_1',
      cardNumber: '4242424242424242',
    });

    const job = await queue.getJob('res_1');
    expect(job).not.toBeNull();
    expect(job?.data).toEqual({
      reservationId: 'res_1',
      cardNumber: '4242424242424242',
    });
  });

  it('does not enqueue a second job for a reservationId that is already queued', async () => {
    await service.enqueueCharge({
      reservationId: 'res_2',
      cardNumber: '4242424242424242',
    });
    await service.enqueueCharge({
      reservationId: 'res_2',
      cardNumber: '4242424242424242',
    });

    const counts = await queue.getJobCounts('waiting', 'active', 'delayed');
    const total = Object.values(counts).reduce(
      (sum, n) => sum + (n as number),
      0,
    );
    expect(total).toBe(1);
  });
});
