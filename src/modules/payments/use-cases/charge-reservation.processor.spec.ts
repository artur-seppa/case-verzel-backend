import { Test } from '@nestjs/testing';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueEvents } from 'bullmq';
import { ulid } from 'ulid';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  ReservationStatus,
  SeatStatus,
  UserRole,
} from '../../../shared/domain/enums';
import { PAYMENT_GATEWAY } from '../../../shared/domain/services/payment-gateway.service';
import { entities } from '../../../shared/infra/database/entities';
import { PAYMENTS_QUEUE_NAME } from '../../../shared/infra/queue/payments-queue.constants';
import { AuthGuardsModule } from '../../../shared/http/guards/auth-guards.module';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../test/support/build-events-dependencies';
import { buildReservationsDependencies } from '../../../../test/support/build-reservations-dependencies';
import { buildCreateUserInput } from '../../../../test/factories/user.factory';
import { buildCreateEventInput } from '../../../../test/factories/event.factory';
import { buildCreateSeatInput } from '../../../../test/factories/seat.factory';
import { buildTestPaymentsQueue } from '../../../../test/support/build-payments-queue-dependencies';
import { WorkerPaymentsModule } from '../worker-payments.module';

async function setupProcessingReservation() {
  const { userRepository } = await buildAuthDependencies();
  const { eventRepository, seatRepository } = await buildEventsDependencies();
  const { reservationRepository } = await buildReservationsDependencies();

  const organizer = await userRepository.create(
    await buildCreateUserInput({ role: UserRole.ORGANIZER }),
  );
  const client = await userRepository.create(
    await buildCreateUserInput({ role: UserRole.CLIENT }),
  );
  const event = await eventRepository.create(
    buildCreateEventInput(organizer.id, { capacity: 1, price: '49.90' }),
  );
  const [seat] = await seatRepository.createMany([
    buildCreateSeatInput(event.id),
  ]);
  const reservation = await reservationRepository.create({
    id: ulid(),
    eventId: event.id,
    clientId: client.id,
    status: ReservationStatus.PENDING_PAYMENT,
    expiresAt: new Date(Date.now() + 600_000),
  });
  await seatRepository.holdSeat(seat.id, reservation.id);
  await reservationRepository.startProcessingIfPending(reservation.id);

  return { reservation, seat, reservationRepository, seatRepository };
}

describe('ChargeReservationProcessor (real Redis + Postgres)', () => {
  let testQueue: ReturnType<typeof buildTestPaymentsQueue>;
  let queueEvents: QueueEvents;

  beforeAll(async () => {
    testQueue = buildTestPaymentsQueue();
    queueEvents = new QueueEvents(PAYMENTS_QUEUE_NAME, {
      connection: testQueue.connection,
    });
    await queueEvents.waitUntilReady();
  });

  afterEach(async () => {
    await testQueue.queue.obliterate({ force: true });
  });

  afterAll(async () => {
    await queueEvents.close();
    await testQueue.close();
  });

  async function withWorker<T>(
    configure: (
      builder: ReturnType<typeof Test.createTestingModule>,
    ) => ReturnType<typeof Test.createTestingModule>,
    run: () => Promise<T>,
  ): Promise<T> {
    const moduleRef = await configure(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true }),
          TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
              type: 'postgres',
              url: config.getOrThrow<string>('DATABASE_URL'),
              entities,
              synchronize: false,
              ssl: false,
            }),
          }),
          BullModule.forRoot({ connection: testQueue.connection }),
          AuthGuardsModule,
          WorkerPaymentsModule,
        ],
      }),
    ).compile();

    const app = await moduleRef.init();
    try {
      return await run();
    } finally {
      await app.close();
    }
  }

  it('confirms the reservation and issues a ticket when the card is approved', async () => {
    const { reservation, seat, reservationRepository, seatRepository } =
      await setupProcessingReservation();

    await withWorker(
      (builder) => builder,
      async () => {
        await testQueue.queue.add(
          'charge-reservation',
          { reservationId: reservation.id, cardNumber: '4242424242424242' },
          { jobId: reservation.id },
        );
        const job = await testQueue.queue.getJob(reservation.id);
        const result = await job!.waitUntilFinished(queueEvents, 10_000);
        expect(result.ticket).not.toBeNull();
      },
    );

    const confirmed = await reservationRepository.findById(reservation.id);
    expect(confirmed?.status).toBe(ReservationStatus.CONFIRMED);
    const soldSeat = await seatRepository.findById(seat.id);
    expect(soldSeat?.status).toBe(SeatStatus.SOLD);
  });

  it('reverts the reservation to pending_payment when the card is declined', async () => {
    const { reservation, reservationRepository } =
      await setupProcessingReservation();

    await withWorker(
      (builder) => builder,
      async () => {
        await testQueue.queue.add(
          'charge-reservation',
          { reservationId: reservation.id, cardNumber: '4000000000000002' },
          { jobId: reservation.id },
        );
        const job = await testQueue.queue.getJob(reservation.id);
        const result = await job!.waitUntilFinished(queueEvents, 10_000);
        expect(result.ticket).toBeNull();
      },
    );

    const reverted = await reservationRepository.findById(reservation.id);
    expect(reverted?.status).toBe(ReservationStatus.PENDING_PAYMENT);
  });

  it('fails fast without retrying when the reservation does not exist', async () => {
    await withWorker(
      (builder) => builder,
      async () => {
        await testQueue.queue.add(
          'charge-reservation',
          { reservationId: 'does-not-exist', cardNumber: '4242424242424242' },
          { jobId: 'does-not-exist' },
        );
        const job = await testQueue.queue.getJob('does-not-exist');
        await expect(
          job!.waitUntilFinished(queueEvents, 10_000),
        ).rejects.toThrow();

        const failed = await testQueue.queue.getJob('does-not-exist');
        expect(failed?.attemptsMade).toBe(1);
      },
    );
  });

  it('retries a transient gateway failure and eventually confirms the reservation', async () => {
    const { reservation, reservationRepository } =
      await setupProcessingReservation();

    let attempts = 0;
    const flakyGateway = {
      charge: async () => {
        attempts += 1;
        if (attempts < 2) {
          const error = new Error('temporary Stripe outage');
          (error as { type?: string }).type = 'StripeAPIError';
          throw error;
        }
        return { approved: true };
      },
    };

    await withWorker(
      (builder) =>
        builder.overrideProvider(PAYMENT_GATEWAY).useValue(flakyGateway),
      async () => {
        await testQueue.queue.add(
          'charge-reservation',
          {
            reservationId: reservation.id,
            cardNumber: '4242424242424242',
          },
          { jobId: reservation.id },
        );
        const job = await testQueue.queue.getJob(reservation.id);
        const result = await job!.waitUntilFinished(queueEvents, 10_000);
        expect(result.ticket).not.toBeNull();
        expect(attempts).toBe(2);
      },
    );

    const confirmed = await reservationRepository.findById(reservation.id);
    expect(confirmed?.status).toBe(ReservationStatus.CONFIRMED);
  }, 15_000);
});
