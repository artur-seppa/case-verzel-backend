import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const requestPaymentResponseSchema = z.object({
  reservationId: z.string(),
  status: z.literal('processing'),
});

export class RequestPaymentResponseDto extends createZodDto(
  requestPaymentResponseSchema,
) {}
