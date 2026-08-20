import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { Event } from '../../../shared/domain/entities/event';
import { createPaginatedResponseDto } from '../../../shared/http/dto/pagination.dto';

export const eventResponseSchema = z.object({
  id: z.string(),
  organizerId: z.string(),
  title: z.string(),
  synopsis: z.string().nullable(),
  posterUrl: z.string().nullable(),
  tmdbId: z.string(),
  date: z.iso.datetime(),
  location: z.string(),
  capacity: z.number(),
  price: z.string(),
  createdAt: z.iso.datetime(),
});

export class EventResponseDto extends createZodDto(eventResponseSchema) {}

export class PaginatedEventsResponseDto extends createPaginatedResponseDto(
  eventResponseSchema,
) {}

export function toEventResponse(event: Event) {
  return {
    ...event,
    date: event.date.toISOString(),
    createdAt: event.createdAt.toISOString(),
  };
}
