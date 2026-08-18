import { Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type { Reservation } from '../../../shared/domain/entities/reservation';
import { ReservationStatus } from '../../../shared/domain/enums';
import { NotFoundError } from '../../../shared/domain/errors';
import { RESERVATION_REPOSITORY } from '../../../shared/domain/repositories/reservation.repository';
import type { ReservationRepository } from '../../../shared/domain/repositories/reservation.repository';
import { SEAT_REPOSITORY } from '../../../shared/domain/repositories/seat.repository';
import type { SeatRepository } from '../../../shared/domain/repositories/seat.repository';

export interface CreateReservationInput {
  eventId: string;
  clientId: string;
  seatId: string;
}

@Injectable()
export class CreateReservationUseCase {
  constructor(
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservationRepository: ReservationRepository,
    @Inject(SEAT_REPOSITORY) private readonly seatRepository: SeatRepository,
  ) {}

  async execute(input: CreateReservationInput): Promise<Reservation> {
    const seat = await this.seatRepository.findById(input.seatId);
    if (!seat || seat.eventId !== input.eventId) {
      throw new NotFoundError('Assento', input.seatId);
    }

    const reservation = await this.reservationRepository.create({
      id: ulid(),
      eventId: input.eventId,
      clientId: input.clientId,
      status: ReservationStatus.PENDING_PAYMENT,
    });

    try {
      await this.seatRepository.holdSeat(input.seatId, reservation.id);
    } catch (error) {
      await this.reservationRepository.updateStatus(
        reservation.id,
        ReservationStatus.CANCELLED,
      );
      throw error;
    }

    return reservation;
  }
}
