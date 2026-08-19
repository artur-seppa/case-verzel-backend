import { Inject, Injectable } from '@nestjs/common';
import { ReservationStatus, SeatStatus } from '../../../shared/domain/enums';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/domain/errors';
import { RESERVATION_REPOSITORY } from '../../../shared/domain/repositories/reservation.repository';
import type { ReservationRepository } from '../../../shared/domain/repositories/reservation.repository';
import { SEAT_REPOSITORY } from '../../../shared/domain/repositories/seat.repository';
import type { SeatRepository } from '../../../shared/domain/repositories/seat.repository';
import { PAYMENT_QUEUE } from '../../../shared/domain/services/payment-queue.service';
import type { PaymentQueueService } from '../../../shared/domain/services/payment-queue.service';

export interface RequestPaymentInput {
  reservationId: string;
  clientId: string;
  cardNumber: string;
}

export interface RequestPaymentOutput {
  reservationId: string;
}

@Injectable()
export class RequestPaymentUseCase {
  constructor(
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservationRepository: ReservationRepository,
    @Inject(SEAT_REPOSITORY) private readonly seatRepository: SeatRepository,
    @Inject(PAYMENT_QUEUE) private readonly paymentQueue: PaymentQueueService,
  ) {}

  async execute(input: RequestPaymentInput): Promise<RequestPaymentOutput> {
    const reservation = await this.reservationRepository.findById(
      input.reservationId,
    );
    if (!reservation) {
      throw new NotFoundError('Reserva', input.reservationId);
    }
    if (reservation.clientId !== input.clientId) {
      throw new ForbiddenError('Essa reserva não pertence a você');
    }
    if (reservation.status !== ReservationStatus.PENDING_PAYMENT) {
      throw new ConflictError('Esta reserva já foi processada');
    }
    if (reservation.expiresAt.getTime() < Date.now()) {
      await this.expireReservation(reservation.id);
      throw new ConflictError('O tempo para pagar essa reserva expirou');
    }

    const started = await this.reservationRepository.startProcessingIfPending(
      reservation.id,
    );
    if (!started) {
      throw new ConflictError('Esta reserva já foi processada');
    }

    await this.paymentQueue.enqueueCharge({
      reservationId: reservation.id,
      cardNumber: input.cardNumber,
    });

    return { reservationId: reservation.id };
  }

  private async expireReservation(reservationId: string): Promise<void> {
    const cancelled =
      await this.reservationRepository.cancelIfPending(reservationId);
    if (!cancelled) return;

    const seat = await this.seatRepository.findByReservationId(reservationId);
    if (seat && seat.status === SeatStatus.HELD) {
      await this.seatRepository.release(seat.id);
    }
  }
}
