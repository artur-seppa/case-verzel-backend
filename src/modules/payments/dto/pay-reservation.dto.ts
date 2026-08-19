import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const payReservationSchema = z.object({
  cardNumber: z
    .string()
    .regex(/^\d{13,19}$/, 'Número de cartão inválido')
    .meta({ example: '4242424242424242' }),
});

export class PayReservationDto extends createZodDto(payReservationSchema) {}
