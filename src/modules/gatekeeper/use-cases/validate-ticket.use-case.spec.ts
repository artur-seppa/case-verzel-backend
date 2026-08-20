import { describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import {
  ReservationStatus,
  TicketStatus,
  UserRole,
} from '../../../shared/domain/enums';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../../../shared/domain/errors';
import { signQrToken } from '../../../shared/utils/qr-token';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../test/support/build-events-dependencies';
import { buildReservationsDependencies } from '../../../../test/support/build-reservations-dependencies';
import { buildPaymentsDependencies } from '../../../../test/support/build-payments-dependencies';
import { buildCreateUserInput } from '../../../../test/factories/user.factory';
import { buildCreateEventInput } from '../../../../test/factories/event.factory';
import { buildCreateSeatInput } from '../../../../test/factories/seat.factory';
import { ValidateTicketUseCase } from './validate-ticket.use-case';

const QR_SECRET = 'test_qr_secret_for_validate_ticket_use_case_spec';

async function setupValidTicket() {
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
  const ticketId = ulid();
  const qrToken = signQrToken(ticketId, QR_SECRET);
  const ticket = await ticketRepository.create({
    id: ticketId,
    reservationId: reservation.id,
    eventId: event.id,
    seatId: seat.id,
    clientId: client.id,
    qrToken,
    shareToken: 'share-token',
  });

  const useCase = new ValidateTicketUseCase(ticketRepository, QR_SECRET);

  return { useCase, ticket, event, seat, qrToken };
}

describe('ValidateTicketUseCase', () => {
  it('validates a valid ticket and marks it used', async () => {
    const { useCase, ticket, event, seat, qrToken } = await setupValidTicket();

    const result = await useCase.execute({ qrToken });

    expect(result.ticket.id).toBe(ticket.id);
    expect(result.ticket.status).toBe(TicketStatus.USED);
    expect(result.ticket.usedAt).not.toBeNull();
    expect(result.event.id).toBe(event.id);
    expect(result.seat.id).toBe(seat.id);
  });

  it('rejects a QR code with an invalid signature', async () => {
    const { useCase } = await setupValidTicket();

    await expect(useCase.execute({ qrToken: 'forged-token' })).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it('rejects a QR code signed for a ticket that does not exist', async () => {
    const { useCase } = await setupValidTicket();
    const forgedButSignedToken = signQrToken('does-not-exist', QR_SECRET);

    await expect(
      useCase.execute({ qrToken: forgedButSignedToken }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects validating the same ticket twice', async () => {
    const { useCase, qrToken } = await setupValidTicket();
    await useCase.execute({ qrToken });

    await expect(useCase.execute({ qrToken })).rejects.toThrow(ConflictError);
  });

  it('never lets two concurrent scans both validate the same ticket', async () => {
    const { useCase, qrToken } = await setupValidTicket();

    const results = await Promise.allSettled([
      useCase.execute({ qrToken }),
      useCase.execute({ qrToken }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictError);
  });
});
