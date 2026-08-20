import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableError } from '../../domain/errors';
import {
  CatalogMovie,
  CatalogMoviePage,
  CatalogService,
} from '../../domain/services/catalog.service';
import { retryWithBackoff } from '../../utils/retry-with-backoff';

const POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const REQUEST_TIMEOUT_MS = 5000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const UNAVAILABLE_MESSAGE =
  'Catálogo de filmes temporariamente indisponível, tente novamente mais tarde';

interface TmdbMovie {
  id: number;
  title: string;
  overview: string | null;
  poster_path: string | null;
  release_date: string | null;
}

interface TmdbListResponse {
  results: TmdbMovie[];
  page: number;
  total_pages: number;
  total_results: number;
}

class RetryableResponseError extends Error {
  constructor(public readonly response: Response) {
    super(`TMDb respondeu ${response.status}`);
  }
}

function getRetryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
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

  private async fetchTmdb(
    path: string,
    params: Record<string, string> = {},
  ): Promise<Response> {
    const baseUrl = this.config.getOrThrow<string>('TMDB_BASE_URL');
    const apiKey = this.config.getOrThrow<string>('TMDB_API_KEY');

    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('language', 'pt-BR');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    try {
      return await retryWithBackoff(
        async () => {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          if (RETRYABLE_STATUS_CODES.has(response.status)) {
            throw new RetryableResponseError(response);
          }
          return response;
        },
        {
          attempts: 3,
          baseDelayMs: 300,
          isRetryable: () => true,
          delayMsForError: (error) =>
            error instanceof RetryableResponseError
              ? getRetryAfterMs(error.response)
              : null,
        },
      );
    } catch (error) {
      if (error instanceof RetryableResponseError) {
        return error.response;
      }
      throw new ServiceUnavailableError(UNAVAILABLE_MESSAGE);
    }
  }

  async listNowPlaying(page: number): Promise<CatalogMoviePage> {
    const response = await this.fetchTmdb('/movie/now_playing', {
      page: String(page),
    });
    if (!response.ok) {
      throw new ServiceUnavailableError(UNAVAILABLE_MESSAGE);
    }

    const data = (await response.json()) as TmdbListResponse;
    return {
      items: data.results.map((movie) => this.toCatalogMovie(movie)),
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  }

  async getMovieById(tmdbId: string): Promise<CatalogMovie | null> {
    const response = await this.fetchTmdb(`/movie/${tmdbId}`);

    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new ServiceUnavailableError(UNAVAILABLE_MESSAGE);
    }

    const movie = (await response.json()) as TmdbMovie;
    return this.toCatalogMovie(movie);
  }
}
