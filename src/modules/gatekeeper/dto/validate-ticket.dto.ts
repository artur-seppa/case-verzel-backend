import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const validateTicketSchema = z.object({
  qrToken: z.string().min(1, 'QR code inválido'),
});

export class ValidateTicketDto extends createZodDto(validateTicketSchema) {}
