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
