import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createReservationSchema = z.object({
  eventId: z.string().min(1),
  seatId: z.string().min(1),
});

export class CreateReservationDto extends createZodDto(
  createReservationSchema,
) {}
