import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createEventSchema = z.object({
  tmdbId: z.string().min(1),
  date: z.iso
    .datetime()
    .refine(
      (value) => new Date(value).getTime() > Date.now(),
      'A data deve ser futura',
    ),
  location: z.string().trim().min(2).max(255),
  capacity: z.number().int().positive().max(260),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Preço inválido'),
});

export class CreateEventDto extends createZodDto(createEventSchema) {}
