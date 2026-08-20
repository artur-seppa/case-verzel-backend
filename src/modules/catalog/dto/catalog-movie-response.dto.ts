import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { createPaginatedResponseDto } from '../../../shared/http/dto/pagination.dto';

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

export class PaginatedCatalogMoviesResponseDto extends createPaginatedResponseDto(
  catalogMovieResponseSchema,
) {}
