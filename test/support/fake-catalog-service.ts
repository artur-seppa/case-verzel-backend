import type {
  CatalogMovie,
  CatalogMoviePage,
  CatalogService,
} from '../../src/shared/domain/services/catalog.service';

export class FakeCatalogService implements CatalogService {
  constructor(private readonly movies: CatalogMovie[] = []) {}

  listNowPlaying(page = 1): Promise<CatalogMoviePage> {
    return Promise.resolve({
      items: this.movies,
      page,
      totalPages: 1,
      totalResults: this.movies.length,
    });
  }

  getMovieById(tmdbId: string): Promise<CatalogMovie | null> {
    return Promise.resolve(
      this.movies.find((movie) => movie.tmdbId === tmdbId) ?? null,
    );
  }
}
