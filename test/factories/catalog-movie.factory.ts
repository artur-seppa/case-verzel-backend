import type { CatalogMovie } from '../../src/shared/domain/services/catalog.service';

export function buildCatalogMovie(
  overrides: Partial<CatalogMovie> = {},
): CatalogMovie {
  return {
    tmdbId: '969681',
    title: 'Filme de Teste',
    synopsis: 'Sinopse de teste',
    posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
    releaseDate: '2026-01-01',
    ...overrides,
  };
}
