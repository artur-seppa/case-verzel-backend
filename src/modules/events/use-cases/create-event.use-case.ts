import { Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type { Event } from '../../../shared/domain/entities/event';
import { NotFoundError } from '../../../shared/domain/errors';
import { CATALOG_SERVICE } from '../../../shared/domain/services/catalog.service';
import type { CatalogService } from '../../../shared/domain/services/catalog.service';
import { EVENT_REPOSITORY } from '../../../shared/domain/repositories/event.repository';
import type { EventRepository } from '../../../shared/domain/repositories/event.repository';
import { SEAT_REPOSITORY } from '../../../shared/domain/repositories/seat.repository';
import type { SeatRepository } from '../../../shared/domain/repositories/seat.repository';
import { generateSeatGrid } from '../../../shared/utils/generate-seat-grid';

export interface CreateEventInput {
  organizerId: string;
  tmdbId: string;
  date: Date;
  location: string;
  capacity: number;
  price: string;
}

@Injectable()
export class CreateEventUseCase {
  constructor(
    @Inject(CATALOG_SERVICE) private readonly catalogService: CatalogService,
    @Inject(EVENT_REPOSITORY) private readonly eventRepository: EventRepository,
    @Inject(SEAT_REPOSITORY) private readonly seatRepository: SeatRepository,
  ) {}

  async execute(input: CreateEventInput): Promise<Event> {
    const movie = await this.catalogService.getMovieById(input.tmdbId);
    if (!movie) {
      throw new NotFoundError('Filme no catálogo', input.tmdbId);
    }

    const event = await this.eventRepository.create({
      id: ulid(),
      organizerId: input.organizerId,
      title: movie.title,
      synopsis: movie.synopsis,
      posterUrl: movie.posterUrl,
      tmdbId: input.tmdbId,
      date: input.date,
      location: input.location,
      capacity: input.capacity,
      price: input.price,
    });

    const seats = generateSeatGrid(input.capacity).map((seat) => ({
      id: ulid(),
      eventId: event.id,
      row: seat.row,
      number: seat.number,
      label: seat.label,
    }));
    await this.seatRepository.createMany(seats);

    return event;
  }
}
