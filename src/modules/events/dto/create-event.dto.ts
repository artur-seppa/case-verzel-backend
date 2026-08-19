import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

function inFourteenDaysUtc(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 14);
  return date.toISOString();
}

export const createEventSchema = z.object({
  tmdbId: z.string().min(1).meta({ example: '969681' }),
  date: z.iso
    .datetime()
    .refine(
      (value) => new Date(value).getTime() > Date.now(),
      'A data deve ser futura',
    )
    .meta({
      description:
        'Data e hora do evento em UTC (ISO 8601, sempre terminando em "Z"). Se estiver montando o horário a partir do seu fuso local, some o offset antes de enviar — ex: 16:42 em GMT-3 vira 19:42Z.',
      example: inFourteenDaysUtc(),
    }),
  location: z
    .string()
    .trim()
    .min(2)
    .max(255)
    .meta({ example: 'Cinema Verzel - Sala 3' }),
  capacity: z.number().int().positive().max(260).meta({ example: 24 }),
  price: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Preço inválido')
    .meta({
      description: 'Use ponto como separador decimal, ex: 39.90',
      example: '39.90',
    }),
});

export class CreateEventDto extends createZodDto(createEventSchema) {}
