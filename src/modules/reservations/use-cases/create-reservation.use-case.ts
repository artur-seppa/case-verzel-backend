import { Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type { Reservation } from '../../../shared/domain/entities/reservation';
import { ReservationStatus } from '../../../shared/domain/enums';
import { RESERVATION_REPOSITORY } from '../../../shared/domain/repositories/reservation.repository';
import type { ReservationRepository } from '../../../shared/domain/repositories/reservation.repository';
import { RESERVATION_HOLD_SECONDS } from '../reservation-hold.token';

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
    @Inject(RESERVATION_HOLD_SECONDS) private readonly holdSeconds: number,
  ) {}

  execute(input: CreateReservationInput): Promise<Reservation> {
    return this.reservationRepository.createWithSeatHold(
      {
        id: ulid(),
        eventId: input.eventId,
        clientId: input.clientId,
        status: ReservationStatus.PENDING_PAYMENT,
        expiresAt: new Date(Date.now() + this.holdSeconds * 1000),
      },
      input.seatId,
    );
  }
}
