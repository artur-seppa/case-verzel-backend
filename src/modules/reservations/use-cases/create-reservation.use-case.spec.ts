import { ulid } from 'ulid';
import { describe, expect, it } from 'vitest';
import {
  ReservationStatus,
  SeatStatus,
  UserRole,
} from '../../../shared/domain/enums';
import { ConflictError, NotFoundError } from '../../../shared/domain/errors';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../test/support/build-events-dependencies';
import { buildReservationsDependencies } from '../../../../test/support/build-reservations-dependencies';
import { buildCreateUserInput } from '../../../../test/factories/user.factory';
import { CreateReservationUseCase } from './create-reservation.use-case';

async function setupEventWithSeats(capacity: number) {
  const { userRepository } = await buildAuthDependencies();
  const { eventRepository, seatRepository } = await buildEventsDependencies();
  const { reservationRepository } = await buildReservationsDependencies();

  const organizer = await userRepository.create(
    await buildCreateUserInput({ role: UserRole.ORGANIZER }),
  );
  const event = await eventRepository.create({
    id: ulid(),
    organizerId: organizer.id,
    title: 'Evento de Teste',
    synopsis: null,
    posterUrl: null,
    tmdbId: '1',
    date: new Date(Date.now() + 86_400_000),
    location: 'Local de Teste',
    capacity,
    price: '10.00',
  });
  const [seat] = await seatRepository.createMany([
    { id: ulid(), eventId: event.id, row: 'A', number: 1, label: 'A1' },
  ]);

  const useCase = new CreateReservationUseCase(
    reservationRepository,
    seatRepository,
  );

  return { event, seat, seatRepository, reservationRepository, useCase };
}

async function createClient() {
  const { userRepository } = await buildAuthDependencies();
  return userRepository.create(
    await buildCreateUserInput({ role: UserRole.CLIENT }),
  );
}

describe('CreateReservationUseCase', () => {
  it('holds the seat and creates a pending reservation', async () => {
    const { event, seat, seatRepository, useCase } =
      await setupEventWithSeats(1);
    const client = await createClient();

    const reservation = await useCase.execute({
      eventId: event.id,
      clientId: client.id,
      seatId: seat.id,
    });

    expect(reservation.status).toBe(ReservationStatus.PENDING_PAYMENT);

    const heldSeat = await seatRepository.findById(seat.id);
    expect(heldSeat?.status).toBe(SeatStatus.HELD);
    expect(heldSeat?.reservationId).toBe(reservation.id);
  });

  it('rejects a seat that does not belong to the given event', async () => {
    const { seat, useCase } = await setupEventWithSeats(1);
    const client = await createClient();

    await expect(
      useCase.execute({
        eventId: 'outro-evento',
        clientId: client.id,
        seatId: seat.id,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('never lets two concurrent reservations win the same seat', async () => {
    const { event, seat, seatRepository, useCase } =
      await setupEventWithSeats(1);
    const [clientA, clientB] = await Promise.all([
      createClient(),
      createClient(),
    ]);

    const results = await Promise.allSettled([
      useCase.execute({
        eventId: event.id,
        clientId: clientA.id,
        seatId: seat.id,
      }),
      useCase.execute({
        eventId: event.id,
        clientId: clientB.id,
        seatId: seat.id,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictError);

    const winningReservation = fulfilled[0].value;
    const heldSeat = await seatRepository.findById(seat.id);
    expect(heldSeat?.status).toBe(SeatStatus.HELD);
    expect(heldSeat?.reservationId).toBe(winningReservation.id);
  });
});
