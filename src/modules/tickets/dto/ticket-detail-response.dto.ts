import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { TicketDetail } from '../ticket-detail';
import { TicketStatus } from '../../../shared/domain/enums';
import { createPaginatedResponseDto } from '../../../shared/http/dto/pagination.dto';

export const ticketDetailResponseSchema = z.object({
  ticket: z.object({
    id: z.string(),
    qrToken: z.string(),
    shareToken: z.string(),
    status: z.enum(TicketStatus),
    createdAt: z.iso.datetime(),
  }),
  event: z.object({
    id: z.string(),
    title: z.string(),
    date: z.iso.datetime(),
    location: z.string(),
  }),
  seat: z.object({
    id: z.string(),
    label: z.string(),
  }),
});

export class TicketDetailResponseDto extends createZodDto(
  ticketDetailResponseSchema,
) {}

export class PaginatedTicketsResponseDto extends createPaginatedResponseDto(
  ticketDetailResponseSchema,
) {}

export function toTicketDetailResponse(result: TicketDetail) {
  return {
    ticket: {
      id: result.ticket.id,
      qrToken: result.ticket.qrToken,
      shareToken: result.ticket.shareToken,
      status: result.ticket.status,
      createdAt: result.ticket.createdAt.toISOString(),
    },
    event: {
      id: result.event.id,
      title: result.event.title,
      date: result.event.date.toISOString(),
      location: result.event.location,
    },
    seat: {
      id: result.seat.id,
      label: result.seat.label,
    },
  };
}
