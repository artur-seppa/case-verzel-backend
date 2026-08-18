import type {
  CatalogMovie,
  CatalogService,
} from '../../src/shared/domain/services/catalog.service';

export class FakeCatalogService implements CatalogService {
  constructor(private readonly movies: CatalogMovie[] = []) {}

  listNowPlaying(): Promise<CatalogMovie[]> {
    return Promise.resolve(this.movies);
  }

  getMovieById(tmdbId: string): Promise<CatalogMovie | null> {
    return Promise.resolve(
      this.movies.find((movie) => movie.tmdbId === tmdbId) ?? null,
    );
  }
}

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
