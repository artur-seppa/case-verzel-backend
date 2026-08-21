import { QueueEvents, Worker } from 'bullmq';
import { firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import { ReservationStatus, UserRole } from '../../shared/domain/enums';
import { ForbiddenError, NotFoundError } from '../../shared/domain/errors';
import { PAYMENTS_QUEUE_NAME } from '../../shared/infra/queue/payments-queue.constants';
import { buildAuthDependencies } from '../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../test/support/build-events-dependencies';
import { buildReservationsDependencies } from '../../../test/support/build-reservations-dependencies';
import { buildCreateUserInput } from '../../../test/factories/user.factory';
import { buildCreateEventInput } from '../../../test/factories/event.factory';
import { buildTestPaymentsQueue } from '../../../test/support/build-payments-queue-dependencies';
import { PaymentEventsStream } from './payment-events.stream';
import { chargeJobId } from '../../shared/infra/queue/charge-job-id';

const DECLINE_CARD = 'decline';
const ERROR_CARD = 'force-error';

async function createPendingReservation() {
  const { userRepository } = await buildAuthDependencies();
  const { eventRepository } = await buildEventsDependencies();
  const { reservationRepository } = await buildReservationsDependencies();

  const organizer = await userRepository.create(
    await buildCreateUserInput({ role: UserRole.ORGANIZER }),
  );
  const client = await userRepository.create(
    await buildCreateUserInput({ role: UserRole.CLIENT }),
  );
  const event = await eventRepository.create(
    buildCreateEventInput(organizer.id, { capacity: 1, price: '10.00' }),
  );
  const reservation = await reservationRepository.create({
    id: ulid(),
    eventId: event.id,
    clientId: client.id,
    status: ReservationStatus.PENDING_PAYMENT,
    expiresAt: new Date(Date.now() + 600_000),
  });

  return { reservationRepository, reservation, client };
}

describe('PaymentEventsStream', () => {
  let testQueue: ReturnType<typeof buildTestPaymentsQueue>;
  let worker: Worker;

  beforeAll(async () => {
    testQueue = buildTestPaymentsQueue();
    worker = new Worker(
      PAYMENTS_QUEUE_NAME,
      async (job) => {
        if (job.data.cardNumber === ERROR_CARD) {
          throw new Error('boom');
        }
        const declined = job.data.cardNumber === DECLINE_CARD;
        return {
          payment: {
            id: 'pay_1',
            reservationId: job.data.reservationId,
            status: declined ? 'declined' : 'approved',
            amount: '10.00',
            createdAt: new Date().toISOString(),
          },
          ticket: declined
            ? null
            : {
                id: 'tic_1',
                qrToken: 'qr',
                shareToken: 'share',
                status: 'valid',
                createdAt: new Date().toISOString(),
              },
        };
      },
      { connection: testQueue.connection },
    );
    await worker.waitUntilReady();
  });

  afterEach(async () => {
    await testQueue.queue.obliterate({ force: true });
  });

  afterAll(async () => {
    await worker.close();
    await testQueue.close();
  });

  it('emits a confirmed event when the job completes with a ticket', async () => {
    const { reservationRepository, reservation, client } =
      await createPendingReservation();
    const queueEvents = new QueueEvents(PAYMENTS_QUEUE_NAME, {
      connection: testQueue.connection,
    });
    await queueEvents.waitUntilReady();
    const stream = new PaymentEventsStream(reservationRepository, queueEvents);

    const observable = await stream.watch(reservation.id, client.id);
    const received = firstValueFrom(observable);

    await testQueue.queue.add(
      'charge-reservation',
      { reservationId: reservation.id, cardNumber: '4242424242424242' },
      { jobId: chargeJobId(reservation.id, 'attempt-1') },
    );

    expect((await received).data).toMatchObject({ type: 'confirmed' });
    await queueEvents.close();
  });

  it('emits a declined event when the job completes without a ticket', async () => {
    const { reservationRepository, reservation, client } =
      await createPendingReservation();
    const queueEvents = new QueueEvents(PAYMENTS_QUEUE_NAME, {
      connection: testQueue.connection,
    });
    await queueEvents.waitUntilReady();
    const stream = new PaymentEventsStream(reservationRepository, queueEvents);

    const observable = await stream.watch(reservation.id, client.id);
    const received = firstValueFrom(observable);

    await testQueue.queue.add(
      'charge-reservation',
      { reservationId: reservation.id, cardNumber: DECLINE_CARD },
      { jobId: chargeJobId(reservation.id, 'attempt-1') },
    );

    expect((await received).data).toMatchObject({ type: 'declined' });
    await queueEvents.close();
  });

  it('emits an error event when the job fails', async () => {
    const { reservationRepository, reservation, client } =
      await createPendingReservation();
    const queueEvents = new QueueEvents(PAYMENTS_QUEUE_NAME, {
      connection: testQueue.connection,
    });
    await queueEvents.waitUntilReady();
    const stream = new PaymentEventsStream(reservationRepository, queueEvents);

    const observable = await stream.watch(reservation.id, client.id);
    const received = firstValueFrom(observable);

    await testQueue.queue.add(
      'charge-reservation',
      { reservationId: reservation.id, cardNumber: ERROR_CARD },
      { jobId: chargeJobId(reservation.id, 'attempt-1'), attempts: 1 },
    );

    expect((await received).data).toMatchObject({ type: 'error' });
    await queueEvents.close();
  });

  it('emits a confirmed event for a retry after a declined attempt on the same reservation', async () => {
    const { reservationRepository, reservation, client } =
      await createPendingReservation();
    const queueEvents = new QueueEvents(PAYMENTS_QUEUE_NAME, {
      connection: testQueue.connection,
    });
    await queueEvents.waitUntilReady();
    const stream = new PaymentEventsStream(reservationRepository, queueEvents);

    const firstAttempt = firstValueFrom(
      await stream.watch(reservation.id, client.id),
    );
    await testQueue.queue.add(
      'charge-reservation',
      { reservationId: reservation.id, cardNumber: DECLINE_CARD },
      { jobId: chargeJobId(reservation.id, 'attempt-1') },
    );
    expect((await firstAttempt).data).toMatchObject({ type: 'declined' });

    const secondAttempt = firstValueFrom(
      await stream.watch(reservation.id, client.id),
    );
    await testQueue.queue.add(
      'charge-reservation',
      { reservationId: reservation.id, cardNumber: '4242424242424242' },
      { jobId: chargeJobId(reservation.id, 'attempt-2') },
    );

    expect((await secondAttempt).data).toMatchObject({ type: 'confirmed' });
    await queueEvents.close();
  });

  it('rejects watching a reservation that belongs to another client', async () => {
    const { reservation } = await createPendingReservation();
    const { userRepository } = await buildAuthDependencies();
    const stranger = await userRepository.create(
      await buildCreateUserInput({ role: UserRole.CLIENT }),
    );
    const queueEvents = new QueueEvents(PAYMENTS_QUEUE_NAME, {
      connection: testQueue.connection,
    });
    await queueEvents.waitUntilReady();
    const { reservationRepository } = await buildReservationsDependencies();
    const stream = new PaymentEventsStream(reservationRepository, queueEvents);

    await expect(
      stream.watch(reservation.id, stranger.id),
    ).rejects.toThrow(ForbiddenError);
    await queueEvents.close();
  });

  it('rejects watching a reservation that does not exist', async () => {
    const { reservationRepository } = await buildReservationsDependencies();
    const queueEvents = new QueueEvents(PAYMENTS_QUEUE_NAME, {
      connection: testQueue.connection,
    });
    await queueEvents.waitUntilReady();
    const stream = new PaymentEventsStream(reservationRepository, queueEvents);

    await expect(
      stream.watch('does-not-exist', 'whoever'),
    ).rejects.toThrow(NotFoundError);
    await queueEvents.close();
  });
});
