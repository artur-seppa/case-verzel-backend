import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const catalogMovieResponseSchema = z.object({
  tmdbId: z.string(),
  title: z.string(),
  synopsis: z.string().nullable(),
  posterUrl: z.string().nullable(),
  releaseDate: z.string().nullable(),
});

export class CatalogMovieResponseDto extends createZodDto(
  catalogMovieResponseSchema,
) {}
