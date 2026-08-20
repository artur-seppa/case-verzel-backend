import { describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import { ReservationStatus, UserRole } from '../../../shared/domain/enums';
import { ForbiddenError, NotFoundError } from '../../../shared/domain/errors';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../test/support/build-events-dependencies';
import { buildReservationsDependencies } from '../../../../test/support/build-reservations-dependencies';
import { buildPaymentsDependencies } from '../../../../test/support/build-payments-dependencies';
import { buildCreateUserInput } from '../../../../test/factories/user.factory';
import { buildCreateEventInput } from '../../../../test/factories/event.factory';
import { buildCreateSeatInput } from '../../../../test/factories/seat.factory';
import { GetTicketByIdUseCase } from './get-ticket-by-id.use-case';

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
    shareToken: 'share-token',
  });

  const useCase = new GetTicketByIdUseCase(
    ticketRepository,
    eventRepository,
    seatRepository,
  );

  return { useCase, ticket, event, seat, client };
}

describe('GetTicketByIdUseCase', () => {
  it('returns the ticket with its event and seat for the owning client', async () => {
    const { useCase, ticket, event, seat, client } = await setupTicket();

    const result = await useCase.execute({
      ticketId: ticket.id,
      clientId: client.id,
    });

    expect(result.ticket.id).toBe(ticket.id);
    expect(result.event.id).toBe(event.id);
    expect(result.seat.id).toBe(seat.id);
  });

  it('rejects a ticket that belongs to another client', async () => {
    const { useCase, ticket } = await setupTicket();
    const { userRepository } = await buildAuthDependencies();
    const stranger = await userRepository.create(
      await buildCreateUserInput({ role: UserRole.CLIENT }),
    );

    await expect(
      useCase.execute({ ticketId: ticket.id, clientId: stranger.id }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('rejects a ticket that does not exist', async () => {
    const { useCase, client } = await setupTicket();

    await expect(
      useCase.execute({ ticketId: 'does-not-exist', clientId: client.id }),
    ).rejects.toThrow(NotFoundError);
  });
});
