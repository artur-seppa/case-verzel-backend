import { describe, expect, it } from 'vitest';
import { ReservationStatus, UserRole } from '../../../shared/domain/enums';
import { ForbiddenError, NotFoundError } from '../../../shared/domain/errors';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../test/support/build-events-dependencies';
import { buildReservationsDependencies } from '../../../../test/support/build-reservations-dependencies';
import { buildCreateUserInput } from '../../../../test/factories/user.factory';
import { buildCreateEventInput } from '../../../../test/factories/event.factory';
import { buildCreateSeatInput } from '../../../../test/factories/seat.factory';
import { CreateReservationUseCase } from './create-reservation.use-case';
import { GetReservationByIdUseCase } from './get-reservation-by-id.use-case';

const HOLD_SECONDS = 600;

async function setup() {
  const { userRepository } = await buildAuthDependencies();
  const { eventRepository, seatRepository } = await buildEventsDependencies();
  const { reservationRepository } = await buildReservationsDependencies();

  const organizer = await userRepository.create(
    await buildCreateUserInput({ role: UserRole.ORGANIZER }),
  );
  const event = await eventRepository.create(
    buildCreateEventInput(organizer.id, { capacity: 1 }),
  );
  const [seat] = await seatRepository.createMany([
    buildCreateSeatInput(event.id),
  ]);
  const client = await userRepository.create(
    await buildCreateUserInput({ role: UserRole.CLIENT }),
  );

  const createUseCase = new CreateReservationUseCase(
    reservationRepository,
    HOLD_SECONDS,
  );
  const reservation = await createUseCase.execute({
    eventId: event.id,
    clientId: client.id,
    seatId: seat.id,
  });

  const useCase = new GetReservationByIdUseCase(
    reservationRepository,
    eventRepository,
    seatRepository,
  );

  return { reservation, client, event, seat, useCase, userRepository };
}

describe('GetReservationByIdUseCase', () => {
  it('returns the reservation with its event and held seat when it belongs to the requesting client', async () => {
    const { reservation, client, event, seat, useCase } = await setup();

    const result = await useCase.execute({
      reservationId: reservation.id,
      clientId: client.id,
    });

    expect(result.id).toBe(reservation.id);
    expect(result.status).toBe(ReservationStatus.PENDING_PAYMENT);
    expect(result.event.id).toBe(event.id);
    expect(result.seat?.id).toBe(seat.id);
  });

  it('throws NotFoundError when the reservation does not exist', async () => {
    const { client, useCase } = await setup();

    await expect(
      useCase.execute({ reservationId: 'nao-existe', clientId: client.id }),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws ForbiddenError when the reservation belongs to another client', async () => {
    const { reservation, useCase, userRepository } = await setup();
    const otherClient = await userRepository.create(
      await buildCreateUserInput({ role: UserRole.CLIENT }),
    );

    await expect(
      useCase.execute({
        reservationId: reservation.id,
        clientId: otherClient.id,
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
