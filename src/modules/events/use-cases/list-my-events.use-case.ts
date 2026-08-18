import { Inject, Injectable } from '@nestjs/common';
import type { Event } from '../../../shared/domain/entities/event';
import { EVENT_REPOSITORY } from '../../../shared/domain/repositories/event.repository';
import type { EventRepository } from '../../../shared/domain/repositories/event.repository';

@Injectable()
export class ListMyEventsUseCase {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly eventRepository: EventRepository,
  ) {}

  execute(organizerId: string): Promise<Event[]> {
    return this.eventRepository.findByOrganizerId(organizerId);
  }
}
