import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const payReservationSchema = z.object({
  cardNumber: z
    .string()
    .regex(/^\d{13,19}$/, 'Número de cartão inválido')
    .meta({ example: '4242424242424242' }),
  idempotencyKey: z.string().min(1).meta({
    description:
      'Gerada pelo cliente, uma por tentativa de pagamento — o mesmo cartão reenviado com a mesma chave não cobra duas vezes; trocar a chave (ex: depois de uma recusa) inicia uma tentativa nova.',
  }),
});

export class PayReservationDto extends createZodDto(payReservationSchema) {}
