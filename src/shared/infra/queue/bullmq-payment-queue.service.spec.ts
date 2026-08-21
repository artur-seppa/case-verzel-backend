import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { buildTestPaymentsQueue } from '../../../../test/support/build-payments-queue-dependencies';
import { BullMqPaymentQueueService } from './bullmq-payment-queue.service';
import { jobIdBelongsToReservation } from './charge-job-id';

describe('BullMqPaymentQueueService', () => {
  const { queue, close } = buildTestPaymentsQueue();
  const service = new BullMqPaymentQueueService(queue);

  afterEach(async () => {
    await queue.obliterate({ force: true });
  });

  afterAll(async () => {
    await close();
  });

  async function jobsForReservation(reservationId: string) {
    const jobs = await queue.getJobs([
      'waiting',
      'active',
      'completed',
      'failed',
    ]);
    return jobs.filter((job) =>
      jobIdBelongsToReservation(job.id!, reservationId),
    );
  }

  it('enqueues a charge job keyed by reservationId and the caller-provided idempotency key', async () => {
    await service.enqueueCharge({
      reservationId: 'res_1',
      cardNumber: '4242424242424242',
      idempotencyKey: 'attempt-1',
    });

    const [job] = await jobsForReservation('res_1');
    expect(job).toBeDefined();
    expect(job?.data).toEqual({
      reservationId: 'res_1',
      cardNumber: '4242424242424242',
      idempotencyKey: 'attempt-1',
    });
  });

  it('does not enqueue a second job when the same idempotency key is reused (network retry of the same attempt)', async () => {
    await service.enqueueCharge({
      reservationId: 'res_2',
      cardNumber: '4242424242424242',
      idempotencyKey: 'attempt-1',
    });
    await service.enqueueCharge({
      reservationId: 'res_2',
      cardNumber: '4242424242424242',
      idempotencyKey: 'attempt-1',
    });

    expect(await jobsForReservation('res_2')).toHaveLength(1);
  });

  it('enqueues a new job when a fresh idempotency key is used (retry with a different card after a decline)', async () => {
    await service.enqueueCharge({
      reservationId: 'res_3',
      cardNumber: '4000000000000002',
      idempotencyKey: 'attempt-1',
    });
    await service.enqueueCharge({
      reservationId: 'res_3',
      cardNumber: '4242424242424242',
      idempotencyKey: 'attempt-2',
    });

    const jobs = await jobsForReservation('res_3');
    expect(jobs).toHaveLength(2);
    expect(new Set(jobs.map((job) => job.id)).size).toBe(2);
  });
});
