import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { SeatStatus } from '../../../shared/domain/enums';

export const seatResponseSchema = z.object({
  id: z.string(),
  row: z.string(),
  number: z.number(),
  label: z.string(),
  status: z.enum(SeatStatus),
});

export class SeatResponseDto extends createZodDto(seatResponseSchema) {}
