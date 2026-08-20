import { describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import type { Ticket } from '../../../shared/domain/entities/ticket';
import { ReservationStatus, UserRole } from '../../../shared/domain/enums';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../test/support/build-events-dependencies';
import { buildReservationsDependencies } from '../../../../test/support/build-reservations-dependencies';
import { buildPaymentsDependencies } from '../../../../test/support/build-payments-dependencies';
import { buildCreateUserInput } from '../../../../test/factories/user.factory';
import { buildCreateEventInput } from '../../../../test/factories/event.factory';
import { buildCreateSeatInput } from '../../../../test/factories/seat.factory';
import { ListMyTicketsUseCase } from './list-my-tickets.use-case';

async function setupClientWithTickets(ticketCount: number) {
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
    buildCreateEventInput(organizer.id, {
      capacity: ticketCount,
      price: '49.90',
    }),
  );

  const tickets: Ticket[] = [];
  for (let i = 0; i < ticketCount; i += 1) {
    const [seat] = await seatRepository.createMany([
      buildCreateSeatInput(event.id, { number: i + 1 }),
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
      qrToken: `qr-token-${i}`,
      shareToken: `share-token-${i}`,
    });
    tickets.push(ticket);
  }

  const useCase = new ListMyTicketsUseCase(
    ticketRepository,
    eventRepository,
    seatRepository,
  );

  return { useCase, client, tickets, event };
}

describe('ListMyTicketsUseCase', () => {
  it('returns all tickets belonging to the client, with event and seat', async () => {
    const { useCase, client, tickets, event } = await setupClientWithTickets(2);

    const result = await useCase.execute(client.id, { page: 1, limit: 20 });

    expect(result.total).toBe(2);
    expect(result.items.map((r) => r.ticket.id).sort()).toEqual(
      tickets.map((t) => t.id).sort(),
    );
    expect(result.items[0].event.id).toBe(event.id);
  });

  it('paginates the results', async () => {
    const { useCase, client } = await setupClientWithTickets(3);

    const page1 = await useCase.execute(client.id, { page: 1, limit: 2 });
    const page2 = await useCase.execute(client.id, { page: 2, limit: 2 });

    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page2.items).toHaveLength(1);
    expect(page2.total).toBe(3);
  });

  it('returns an empty array when the client has no tickets', async () => {
    const { userRepository } = await buildAuthDependencies();
    const client = await userRepository.create(
      await buildCreateUserInput({ role: UserRole.CLIENT }),
    );
    const { ticketRepository } = await buildPaymentsDependencies();
    const { eventRepository, seatRepository } = await buildEventsDependencies();

    const useCase = new ListMyTicketsUseCase(
      ticketRepository,
      eventRepository,
      seatRepository,
    );

    const result = await useCase.execute(client.id, { page: 1, limit: 20 });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
