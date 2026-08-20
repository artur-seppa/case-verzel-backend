import { Inject, Injectable } from '@nestjs/common';
import type { Event } from '../../../shared/domain/entities/event';
import type {
  Paginated,
  PaginationParams,
} from '../../../shared/domain/pagination';
import { EVENT_REPOSITORY } from '../../../shared/domain/repositories/event.repository';
import type { EventRepository } from '../../../shared/domain/repositories/event.repository';

@Injectable()
export class ListEventsUseCase {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly eventRepository: EventRepository,
  ) {}

  execute(pagination: PaginationParams): Promise<Paginated<Event>> {
    return this.eventRepository.findAll(pagination);
  }
}
