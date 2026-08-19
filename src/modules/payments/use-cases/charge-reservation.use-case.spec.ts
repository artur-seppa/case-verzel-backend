import { describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import {
  PaymentStatus,
  ReservationStatus,
  SeatStatus,
  UserRole,
} from '../../../shared/domain/enums';
import { ConflictError, NotFoundError } from '../../../shared/domain/errors';
import { verifyQrToken } from '../../../shared/utils/qr-token';
import { SimulatedPaymentGatewayService } from '../../../shared/infra/payment/simulated-payment-gateway.service';
import { buildAuthDependencies } from '../../../../test/support/build-auth-dependencies';
import { buildEventsDependencies } from '../../../../test/support/build-events-dependencies';
import { buildReservationsDependencies } from '../../../../test/support/build-reservations-dependencies';
import { buildPaymentsDependencies } from '../../../../test/support/build-payments-dependencies';
import { buildCreateUserInput } from '../../../../test/factories/user.factory';
import { buildCreateEventInput } from '../../../../test/factories/event.factory';
import { buildCreateSeatInput } from '../../../../test/factories/seat.factory';
import { ChargeReservationUseCase } from './charge-reservation.use-case';

const QR_SECRET = 'test_qr_secret_for_charge_reservation_use_case_spec';
const APPROVE_CARD = '4242424242424242';
const DECLINE_CARD = '4000000000000002';

async function setupProcessingReservation() {
  const { userRepository } = await buildAuthDependencies();
  const { eventRepository, seatRepository } = await buildEventsDependencies();
  const { reservationRepository } = await buildReservationsDependencies();
  const { paymentRepository, ticketRepository } =
    await buildPaymentsDependencies();

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

  const useCase = new ChargeReservationUseCase(
    reservationRepository,
    seatRepository,
    eventRepository,
    paymentRepository,
    ticketRepository,
    new SimulatedPaymentGatewayService(),
    QR_SECRET,
  );

  return {
    event,
    seat,
    client,
    reservation,
    seatRepository,
    reservationRepository,
    useCase,
  };
}

describe('ChargeReservationUseCase', () => {
  it('approves a valid card, confirms the reservation and issues a ticket', async () => {
    const { event, seat, client, reservation, seatRepository, useCase } =
      await setupProcessingReservation();

    const { payment, ticket } = await useCase.execute({
      reservationId: reservation.id,
      cardNumber: APPROVE_CARD,
    });

    expect(payment.status).toBe(PaymentStatus.APPROVED);
    expect(payment.amount).toBe(event.price);
    expect(ticket).not.toBeNull();
    expect(ticket?.seatId).toBe(seat.id);
    expect(ticket?.clientId).toBe(client.id);
    expect(verifyQrToken(ticket!.qrToken, QR_SECRET)).toBe(ticket!.id);

    const soldSeat = await seatRepository.findById(seat.id);
    expect(soldSeat?.status).toBe(SeatStatus.SOLD);
  });

  it('declines the known decline-test card and reverts the reservation to pending_payment', async () => {
    const { reservation, seat, seatRepository, reservationRepository, useCase } =
      await setupProcessingReservation();

    const { payment, ticket } = await useCase.execute({
      reservationId: reservation.id,
      cardNumber: DECLINE_CARD,
    });

    expect(payment.status).toBe(PaymentStatus.DECLINED);
    expect(ticket).toBeNull();

    const reverted = await reservationRepository.findById(reservation.id);
    expect(reverted?.status).toBe(ReservationStatus.PENDING_PAYMENT);
    const heldSeat = await seatRepository.findById(seat.id);
    expect(heldSeat?.status).toBe(SeatStatus.HELD);
  });

  it('lets the client retry with a different card after a decline', async () => {
    const { reservation, reservationRepository, useCase } =
      await setupProcessingReservation();

    await useCase.execute({
      reservationId: reservation.id,
      cardNumber: DECLINE_CARD,
    });
    await reservationRepository.startProcessingIfPending(reservation.id);

    const { payment, ticket } = await useCase.execute({
      reservationId: reservation.id,
      cardNumber: APPROVE_CARD,
    });

    expect(payment.status).toBe(PaymentStatus.APPROVED);
    expect(ticket).not.toBeNull();

    const confirmed = await reservationRepository.findById(reservation.id);
    expect(confirmed?.status).toBe(ReservationStatus.CONFIRMED);
  });

  it('rejects confirming a reservation that was never moved to processing', async () => {
    const { reservationRepository, useCase, event, client } =
      await setupProcessingReservation();

    const otherReservation = await reservationRepository.create({
      id: ulid(),
      eventId: event.id,
      clientId: client.id,
      status: ReservationStatus.PENDING_PAYMENT,
      expiresAt: new Date(Date.now() + 600_000),
    });

    await expect(
      useCase.execute({
        reservationId: otherReservation.id,
        cardNumber: APPROVE_CARD,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('rejects charging a reservation that does not exist', async () => {
    const { useCase } = await setupProcessingReservation();

    await expect(
      useCase.execute({
        reservationId: 'does-not-exist',
        cardNumber: APPROVE_CARD,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('never lets two concurrent approvals both confirm the same reservation', async () => {
    const { reservation, seatRepository, useCase } =
      await setupProcessingReservation();

    const results = await Promise.allSettled([
      useCase.execute({ reservationId: reservation.id, cardNumber: APPROVE_CARD }),
      useCase.execute({ reservationId: reservation.id, cardNumber: APPROVE_CARD }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictError,
    );

    const seat = await seatRepository.findByReservationId(reservation.id);
    expect(seat?.status).toBe(SeatStatus.SOLD);
  });
});
