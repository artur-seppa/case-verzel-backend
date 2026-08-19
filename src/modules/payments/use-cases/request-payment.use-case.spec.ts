import { describe, expect, it } from 'vitest';
import { UserRole } from '../../../shared/domain/enums';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/domain/errors';
import type {
  EnqueueChargeInput,
  PaymentQueueService,
} from '../../../shared/domain/services/payment-queue.service';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../test/support/build-events-dependencies';
import { buildReservationsDependencies } from '../../../../test/support/build-reservations-dependencies';
import { buildCreateUserInput } from '../../../../test/factories/user.factory';
import { buildCreateEventInput } from '../../../../test/factories/event.factory';
import { buildCreateSeatInput } from '../../../../test/factories/seat.factory';
import { CreateReservationUseCase } from '../../reservations/use-cases/create-reservation.use-case';
import { RequestPaymentUseCase } from './request-payment.use-case';

class FakePaymentQueue implements PaymentQueueService {
  readonly enqueued: EnqueueChargeInput[] = [];

  async enqueueCharge(input: EnqueueChargeInput): Promise<void> {
    this.enqueued.push(input);
  }
}

async function setupPendingReservation(holdSeconds = 600) {
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

  const createReservation = new CreateReservationUseCase(
    reservationRepository,
    seatRepository,
    holdSeconds,
  );
  const reservation = await createReservation.execute({
    eventId: event.id,
    clientId: client.id,
    seatId: seat.id,
  });

  const queue = new FakePaymentQueue();
  const useCase = new RequestPaymentUseCase(
    reservationRepository,
    seatRepository,
    queue,
  );

  return {
    client,
    reservation,
    seat,
    seatRepository,
    reservationRepository,
    queue,
    useCase,
  };
}

describe('RequestPaymentUseCase', () => {
  it('moves the reservation to processing and enqueues a charge job', async () => {
    const { client, reservation, reservationRepository, queue, useCase } =
      await setupPendingReservation();

    const result = await useCase.execute({
      reservationId: reservation.id,
      clientId: client.id,
      cardNumber: '4242424242424242',
    });

    expect(result).toEqual({ reservationId: reservation.id });
    expect(queue.enqueued).toEqual([
      { reservationId: reservation.id, cardNumber: '4242424242424242' },
    ]);

    const updated = await reservationRepository.findById(reservation.id);
    expect(updated?.status).toBe('processing');
  });

  it('rejects paying for a reservation that belongs to another client', async () => {
    const { reservation, useCase } = await setupPendingReservation();
    const { userRepository } = await buildAuthDependencies();
    const stranger = await userRepository.create(
      await buildCreateUserInput({ role: UserRole.CLIENT }),
    );

    await expect(
      useCase.execute({
        reservationId: reservation.id,
        clientId: stranger.id,
        cardNumber: '4242424242424242',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('rejects paying for a reservation that is no longer pending', async () => {
    const { client, reservation, useCase } = await setupPendingReservation();

    await useCase.execute({
      reservationId: reservation.id,
      clientId: client.id,
      cardNumber: '4242424242424242',
    });

    await expect(
      useCase.execute({
        reservationId: reservation.id,
        clientId: client.id,
        cardNumber: '4242424242424242',
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('rejects paying for a reservation that does not exist', async () => {
    const { client, useCase } = await setupPendingReservation();

    await expect(
      useCase.execute({
        reservationId: 'does-not-exist',
        clientId: client.id,
        cardNumber: '4242424242424242',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('expires an overdue reservation, releases the seat and rejects the payment', async () => {
    const { client, reservation, seat, seatRepository, useCase } =
      await setupPendingReservation(-1);

    await expect(
      useCase.execute({
        reservationId: reservation.id,
        clientId: client.id,
        cardNumber: '4242424242424242',
      }),
    ).rejects.toThrow(ConflictError);

    const releasedSeat = await seatRepository.findById(seat.id);
    expect(releasedSeat?.status).toBe('available');
    expect(releasedSeat?.reservationId).toBeNull();
  });

  it('never lets two concurrent requests both enqueue a job for the same reservation', async () => {
    const { client, reservation, queue, useCase } =
      await setupPendingReservation();

    const results = await Promise.allSettled([
      useCase.execute({
        reservationId: reservation.id,
        clientId: client.id,
        cardNumber: '4242424242424242',
      }),
      useCase.execute({
        reservationId: reservation.id,
        clientId: client.id,
        cardNumber: '4242424242424242',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictError,
    );
    expect(queue.enqueued).toHaveLength(1);
  });
});
