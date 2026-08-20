import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { ValidateTicketOutput } from '../use-cases/validate-ticket.use-case';
import { TicketStatus } from '../../../shared/domain/enums';

export const validateTicketResponseSchema = z.object({
  ticket: z.object({
    id: z.string(),
    status: z.enum(TicketStatus),
    usedAt: z.iso.datetime().nullable(),
  }),
  event: z.object({
    id: z.string(),
    title: z.string(),
  }),
  seat: z.object({
    id: z.string(),
    label: z.string(),
  }),
});

export class ValidateTicketResponseDto extends createZodDto(
  validateTicketResponseSchema,
) {}

export function toValidateTicketResponse(result: ValidateTicketOutput) {
  return {
    ticket: {
      id: result.ticket.id,
      status: result.ticket.status,
      usedAt: result.ticket.usedAt ? result.ticket.usedAt.toISOString() : null,
    },
    event: {
      id: result.event.id,
      title: result.event.title,
    },
    seat: {
      id: result.seat.id,
      label: result.seat.label,
    },
  };
}
