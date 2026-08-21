import { Inject, Injectable } from '@nestjs/common';
import type { Event } from '../../../shared/domain/entities/event';
import type { Reservation } from '../../../shared/domain/entities/reservation';
import type { Seat } from '../../../shared/domain/entities/seat';
import { ForbiddenError, NotFoundError } from '../../../shared/domain/errors';
import { EVENT_REPOSITORY } from '../../../shared/domain/repositories/event.repository';
import type { EventRepository } from '../../../shared/domain/repositories/event.repository';
import { RESERVATION_REPOSITORY } from '../../../shared/domain/repositories/reservation.repository';
import type { ReservationRepository } from '../../../shared/domain/repositories/reservation.repository';
import { SEAT_REPOSITORY } from '../../../shared/domain/repositories/seat.repository';
import type { SeatRepository } from '../../../shared/domain/repositories/seat.repository';

export interface GetReservationByIdInput {
  reservationId: string;
  clientId: string;
}

export interface ReservationWithEventAndSeat extends Reservation {
  event: Event;
  // null once the seat hold has been released (e.g. an expired reservation) —
  // the reservation itself still exists, but no longer points at a held seat.
  seat: Seat | null;
}

@Injectable()
export class GetReservationByIdUseCase {
  constructor(
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservationRepository: ReservationRepository,
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepository: EventRepository,
    @Inject(SEAT_REPOSITORY)
    private readonly seatRepository: SeatRepository,
  ) {}

  async execute(
    input: GetReservationByIdInput,
  ): Promise<ReservationWithEventAndSeat> {
    const reservation = await this.reservationRepository.findById(
      input.reservationId,
    );
    if (!reservation) {
      throw new NotFoundError('Reserva', input.reservationId);
    }
    if (reservation.clientId !== input.clientId) {
      throw new ForbiddenError('Essa reserva não pertence a você');
    }

    const event = await this.eventRepository.findById(reservation.eventId);
    if (!event) {
      throw new NotFoundError('Evento', reservation.eventId);
    }
    const seat = await this.seatRepository.findByReservationId(
      reservation.id,
    );

    return { ...reservation, event, seat };
  }
}
