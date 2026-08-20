import { describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import {
  ReservationStatus,
  TicketStatus,
  UserRole,
} from '../../../domain/enums';
import { buildAuthDependencies } from '../../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../../test/support/build-events-dependencies';
import { buildReservationsDependencies } from '../../../../../test/support/build-reservations-dependencies';
import { buildPaymentsDependencies } from '../../../../../test/support/build-payments-dependencies';
import { buildCreateUserInput } from '../../../../../test/factories/user.factory';
import { buildCreateEventInput } from '../../../../../test/factories/event.factory';
import { buildCreateSeatInput } from '../../../../../test/factories/seat.factory';

async function createValidTicket() {
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

  return { ticketRepository, ticket, client };
}

describe('TypeOrmTicketRepository', () => {
  it('finds a ticket by id', async () => {
    const { ticketRepository, ticket } = await createValidTicket();

    const found = await ticketRepository.findById(ticket.id);

    expect(found?.id).toBe(ticket.id);
  });

  it('returns null when a ticket id does not exist', async () => {
    const { ticketRepository } = await createValidTicket();

    expect(await ticketRepository.findById('does-not-exist')).toBeNull();
  });

  it('rejects a second ticket for the same reservation at the DB level', async () => {
    const { ticketRepository, ticket } = await createValidTicket();
    const { seatRepository } = await buildEventsDependencies();
    const [otherSeat] = await seatRepository.createMany([
      buildCreateSeatInput(ticket.eventId, { number: 2 }),
    ]);

    await expect(
      ticketRepository.create({
        id: ulid(),
        reservationId: ticket.reservationId,
        eventId: ticket.eventId,
        seatId: otherSeat.id,
        clientId: ticket.clientId,
        qrToken: 'qr-token-2',
        shareToken: 'share-token-2',
      }),
    ).rejects.toThrow();
  });

  it('finds a ticket by shareToken', async () => {
    const { ticketRepository, ticket } = await createValidTicket();

    const found = await ticketRepository.findByShareToken('share-token');

    expect(found?.id).toBe(ticket.id);
  });

  it('returns null when a shareToken does not exist', async () => {
    const { ticketRepository } = await createValidTicket();

    expect(
      await ticketRepository.findByShareToken('does-not-exist'),
    ).toBeNull();
  });

  it('validates a valid ticket and marks it used', async () => {
    const { ticketRepository, ticket } = await createValidTicket();

    const result = await ticketRepository.validate(ticket.id);

    expect(result.ticket.status).toBe(TicketStatus.USED);
    expect(result.ticket.usedAt).not.toBeNull();
    const updated = await ticketRepository.findById(ticket.id);
    expect(updated?.status).toBe(TicketStatus.USED);
    expect(updated?.usedAt).not.toBeNull();
  });

  it('refuses to validate an already-used ticket again', async () => {
    const { ticketRepository, ticket } = await createValidTicket();
    await ticketRepository.validate(ticket.id);

    await expect(ticketRepository.validate(ticket.id)).rejects.toThrow(
      'Ingresso já foi utilizado',
    );
  });

  it('never lets two concurrent validations both mark the same ticket used', async () => {
    const { ticketRepository, ticket } = await createValidTicket();

    const results = await Promise.allSettled([
      ticketRepository.validate(ticket.id),
      ticketRepository.validate(ticket.id),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('finds tickets by clientId, newest first', async () => {
    const { ticketRepository, ticket, client } = await createValidTicket();
    const { seatRepository } = await buildEventsDependencies();
    const { reservationRepository } = await buildReservationsDependencies();
    const [otherSeat] = await seatRepository.createMany([
      buildCreateSeatInput(ticket.eventId, { number: 2 }),
    ]);
    const otherReservation = await reservationRepository.create({
      id: ulid(),
      eventId: ticket.eventId,
      clientId: client.id,
      status: ReservationStatus.CONFIRMED,
      expiresAt: new Date(Date.now() + 600_000),
    });
    const second = await ticketRepository.create({
      id: ulid(),
      reservationId: otherReservation.id,
      eventId: ticket.eventId,
      seatId: otherSeat.id,
      clientId: client.id,
      qrToken: 'qr-token-2',
      shareToken: 'share-token-2',
    });

    const result = await ticketRepository.findByClientId(client.id, {
      page: 1,
      limit: 20,
    });

    expect(result.total).toBe(2);
    expect(result.items.map((t) => t.id)).toEqual([second.id, ticket.id]);
  });

  it('paginates tickets by clientId', async () => {
    const { ticketRepository, ticket, client } = await createValidTicket();
    const { seatRepository } = await buildEventsDependencies();
    const { reservationRepository } = await buildReservationsDependencies();
    const [otherSeat] = await seatRepository.createMany([
      buildCreateSeatInput(ticket.eventId, { number: 2 }),
    ]);
    const otherReservation = await reservationRepository.create({
      id: ulid(),
      eventId: ticket.eventId,
      clientId: client.id,
      status: ReservationStatus.CONFIRMED,
      expiresAt: new Date(Date.now() + 600_000),
    });
    await ticketRepository.create({
      id: ulid(),
      reservationId: otherReservation.id,
      eventId: ticket.eventId,
      seatId: otherSeat.id,
      clientId: client.id,
      qrToken: 'qr-token-2',
      shareToken: 'share-token-2',
    });

    const page1 = await ticketRepository.findByClientId(client.id, {
      page: 1,
      limit: 1,
    });
    const page2 = await ticketRepository.findByClientId(client.id, {
      page: 2,
      limit: 1,
    });

    expect(page1.total).toBe(2);
    expect(page1.items).toHaveLength(1);
    expect(page2.items).toHaveLength(1);
    expect(page1.items[0].id).not.toBe(page2.items[0].id);
  });

  it('returns an empty array when the client has no tickets', async () => {
    const { userRepository } = await buildAuthDependencies();
    const { ticketRepository } = await createValidTicket();
    const otherClient = await userRepository.create(
      await buildCreateUserInput({ role: UserRole.CLIENT }),
    );

    const result = await ticketRepository.findByClientId(otherClient.id, {
      page: 1,
      limit: 20,
    });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
