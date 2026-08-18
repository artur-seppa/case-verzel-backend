export interface CatalogMovie {
  tmdbId: string;
  title: string;
  synopsis: string | null;
  posterUrl: string | null;
  releaseDate: string | null;
}

export interface CatalogService {
  listNowPlaying(page: number): Promise<CatalogMovie[]>;
  getMovieById(tmdbId: string): Promise<CatalogMovie | null>;
}

export const CATALOG_SERVICE = Symbol('CATALOG_SERVICE');
