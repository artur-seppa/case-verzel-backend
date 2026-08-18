import { createZodDto } from 'nestjs-zod';
import type { EventWithSeats } from '../use-cases/get-event.use-case';
import { eventResponseSchema, toEventResponse } from './event-response.dto';
import { seatResponseSchema } from './seat-response.dto';

export const eventDetailResponseSchema = eventResponseSchema.extend({
  seats: seatResponseSchema.array(),
});

export class EventDetailResponseDto extends createZodDto(
  eventDetailResponseSchema,
) {}

export function toEventDetailResponse(event: EventWithSeats) {
  return {
    ...toEventResponse(event),
    seats: event.seats,
  };
}
