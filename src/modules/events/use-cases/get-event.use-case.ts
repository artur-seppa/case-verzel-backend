import { Inject, Injectable } from '@nestjs/common';
import type { Event } from '../../../shared/domain/entities/event';
import type { Seat } from '../../../shared/domain/entities/seat';
import { NotFoundError } from '../../../shared/domain/errors';
import { EVENT_REPOSITORY } from '../../../shared/domain/repositories/event.repository';
import type { EventRepository } from '../../../shared/domain/repositories/event.repository';
import { SEAT_REPOSITORY } from '../../../shared/domain/repositories/seat.repository';
import type { SeatRepository } from '../../../shared/domain/repositories/seat.repository';

export interface EventWithSeats extends Event {
  seats: Seat[];
}

@Injectable()
export class GetEventUseCase {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly eventRepository: EventRepository,
    @Inject(SEAT_REPOSITORY) private readonly seatRepository: SeatRepository,
  ) {}

  async execute(id: string): Promise<EventWithSeats> {
    const event = await this.eventRepository.findById(id);
    if (!event) {
      throw new NotFoundError('Evento', id);
    }

    const seats = await this.seatRepository.findByEventId(id);

    return { ...event, seats };
  }
}
