import { describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import { ReservationStatus, UserRole } from '../../../shared/domain/enums';
import { NotFoundError } from '../../../shared/domain/errors';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../test/support/build-events-dependencies';
import { buildReservationsDependencies } from '../../../../test/support/build-reservations-dependencies';
import { buildPaymentsDependencies } from '../../../../test/support/build-payments-dependencies';
import { buildCreateUserInput } from '../../../../test/factories/user.factory';
import { buildCreateEventInput } from '../../../../test/factories/event.factory';
import { buildCreateSeatInput } from '../../../../test/factories/seat.factory';
import { GetSharedTicketUseCase } from './get-shared-ticket.use-case';

async function setupTicket() {
  const { userRepository } = await buildAuthDependencies();
  const { eventRepository, seatRepository } = await buildEventsDependencies();
  const { reservationRepository } = await buildReservationsDependencies();
  const { ticketRepository } = await buildPaymentsDependencies();

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
    status: ReservationStatus.CONFIRMED,
    expiresAt: new Date(Date.now() + 600_000),
  });
  const ticket = await ticketRepository.create({
    id: ulid(),
    reservationId: reservation.id,
    eventId: event.id,
    seatId: seat.id,
    clientId: client.id,
    qrToken: 'qr-token',
    shareToken: 'share-token-abc',
  });

  const useCase = new GetSharedTicketUseCase(
    ticketRepository,
    eventRepository,
    seatRepository,
  );

  return { useCase, ticket, event, seat };
}

describe('GetSharedTicketUseCase', () => {
  it('returns the ticket with its event and seat', async () => {
    const { useCase, ticket, event, seat } = await setupTicket();

    const result = await useCase.execute({ shareToken: 'share-token-abc' });

    expect(result.ticket.id).toBe(ticket.id);
    expect(result.event.id).toBe(event.id);
    expect(result.seat.id).toBe(seat.id);
  });

  it('rejects a shareToken that does not exist', async () => {
    const { useCase } = await setupTicket();

    await expect(
      useCase.execute({ shareToken: 'does-not-exist' }),
    ).rejects.toThrow(NotFoundError);
  });
});
