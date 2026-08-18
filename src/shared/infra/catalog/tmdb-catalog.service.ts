import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CatalogMovie,
  CatalogService,
} from '../../domain/services/catalog.service';

const POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w500';

interface TmdbMovie {
  id: number;
  title: string;
  overview: string | null;
  poster_path: string | null;
  release_date: string | null;
}

interface TmdbListResponse {
  results: TmdbMovie[];
}

@Injectable()
export class TmdbCatalogService implements CatalogService {
  constructor(private readonly config: ConfigService) {}

  private toCatalogMovie(movie: TmdbMovie): CatalogMovie {
    return {
      tmdbId: String(movie.id),
      title: movie.title,
      synopsis: movie.overview || null,
      posterUrl: movie.poster_path
        ? `${POSTER_BASE_URL}${movie.poster_path}`
        : null,
      releaseDate: movie.release_date || null,
    };
  }

  private async request<T>(path: string, params: Record<string, string> = {}) {
    const baseUrl = this.config.getOrThrow<string>('TMDB_BASE_URL');
    const apiKey = this.config.getOrThrow<string>('TMDB_API_KEY');

    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('language', 'pt-BR');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  }

  async listNowPlaying(page: number): Promise<CatalogMovie[]> {
    const data = await this.request<TmdbListResponse>('/movie/now_playing', {
      page: String(page),
    });
    return (data?.results ?? []).map((movie) => this.toCatalogMovie(movie));
  }

  async getMovieById(tmdbId: string): Promise<CatalogMovie | null> {
    const movie = await this.request<TmdbMovie>(`/movie/${tmdbId}`);
    return movie ? this.toCatalogMovie(movie) : null;
  }
}
