import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { Paginated } from '../../domain/pagination';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

export class PageQueryDto extends createZodDto(pageQuerySchema) {}

export const paginationMetaSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

export function createPaginatedResponseDto<T extends z.ZodTypeAny>(
  itemSchema: T,
) {
  return createZodDto(
    z.object({
      data: z.array(itemSchema),
      meta: paginationMetaSchema,
    }),
  );
}

export function toPaginatedResponse<T>(
  { items, total }: Paginated<T>,
  page: number,
  limit: number,
) {
  return {
    data: items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}
