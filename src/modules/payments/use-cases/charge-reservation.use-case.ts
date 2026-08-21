import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type { Payment } from '../../../shared/domain/entities/payment';
import type { Ticket } from '../../../shared/domain/entities/ticket';
import { PaymentStatus } from '../../../shared/domain/enums';
import { ConflictError, NotFoundError } from '../../../shared/domain/errors';
import { EVENT_REPOSITORY } from '../../../shared/domain/repositories/event.repository';
import type { EventRepository } from '../../../shared/domain/repositories/event.repository';
import { PAYMENT_REPOSITORY } from '../../../shared/domain/repositories/payment.repository';
import type { PaymentRepository } from '../../../shared/domain/repositories/payment.repository';
import { RESERVATION_REPOSITORY } from '../../../shared/domain/repositories/reservation.repository';
import type { ReservationRepository } from '../../../shared/domain/repositories/reservation.repository';
import { SEAT_REPOSITORY } from '../../../shared/domain/repositories/seat.repository';
import type { SeatRepository } from '../../../shared/domain/repositories/seat.repository';
import { TICKET_REPOSITORY } from '../../../shared/domain/repositories/ticket.repository';
import type { TicketRepository } from '../../../shared/domain/repositories/ticket.repository';
import { PAYMENT_GATEWAY } from '../../../shared/domain/services/payment-gateway.service';
import type { PaymentGatewayService } from '../../../shared/domain/services/payment-gateway.service';
import { QR_SECRET, signQrToken } from '../../../shared/utils/qr-token';

export interface ChargeReservationInput {
  reservationId: string;
  cardNumber: string;
  idempotencyKey: string;
}

export interface ChargeReservationOutput {
  payment: Payment;
  ticket: Ticket | null;
}

@Injectable()
export class ChargeReservationUseCase {
  constructor(
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservationRepository: ReservationRepository,
    @Inject(SEAT_REPOSITORY) private readonly seatRepository: SeatRepository,
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepository: EventRepository,
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepository: PaymentRepository,
    @Inject(TICKET_REPOSITORY)
    private readonly ticketRepository: TicketRepository,
    @Inject(PAYMENT_GATEWAY)
    private readonly paymentGateway: PaymentGatewayService,
    @Inject(QR_SECRET) private readonly qrSecret: string,
  ) {}

  async execute(
    input: ChargeReservationInput,
  ): Promise<ChargeReservationOutput> {
    const reservation = await this.reservationRepository.findById(
      input.reservationId,
    );
    if (!reservation) {
      throw new NotFoundError('Reserva', input.reservationId);
    }

    const event = await this.eventRepository.findById(reservation.eventId);
    if (!event) {
      throw new NotFoundError('Evento', reservation.eventId);
    }

    const { approved } = await this.paymentGateway.charge({
      reservationId: reservation.id,
      amount: event.price,
      cardNumber: input.cardNumber,
      idempotencyKey: input.idempotencyKey,
    });

    const payment = await this.paymentRepository.create({
      id: ulid(),
      reservationId: reservation.id,
      status: approved ? PaymentStatus.APPROVED : PaymentStatus.DECLINED,
      amount: event.price,
    });

    if (!approved) {
      await this.reservationRepository.revertToPendingIfProcessing(
        reservation.id,
      );
      return { payment, ticket: null };
    }

    const confirmed = await this.reservationRepository.confirmIfProcessing(
      reservation.id,
    );
    if (!confirmed) {
      throw new ConflictError('Esta reserva já foi processada');
    }

    const seat = await this.seatRepository.findByReservationId(reservation.id);
    if (!seat) {
      throw new NotFoundError('Assento', reservation.id);
    }
    await this.seatRepository.markSold(seat.id);

    const ticketId = ulid();
    const ticket = await this.ticketRepository.create({
      id: ticketId,
      reservationId: reservation.id,
      eventId: reservation.eventId,
      seatId: seat.id,
      clientId: reservation.clientId,
      qrToken: signQrToken(ticketId, this.qrSecret),
      shareToken: randomBytes(16).toString('hex'),
    });

    return { payment, ticket };
  }
}
