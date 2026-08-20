import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableError } from '../../domain/errors';
import { TmdbCatalogService } from './tmdb-catalog.service';

function buildService() {
  return new TmdbCatalogService(
    new ConfigService({
      TMDB_BASE_URL: 'https://api.themoviedb.org/3',
      TMDB_API_KEY: 'test-key',
    }),
  );
}

function mockFetchResponse(
  init: Partial<Response> & { ok: boolean; status: number },
) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      json: () => Promise.resolve({}),
      headers: new Headers(),
      ...init,
    }),
  );
}

describe('TmdbCatalogService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when TMDb genuinely reports the movie as not found', async () => {
    mockFetchResponse({ ok: false, status: 404 });

    const result = await buildService().getMovieById('does-not-exist');

    expect(result).toBeNull();
  });

  it('returns the parsed movie on success', async () => {
    mockFetchResponse({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: 969681,
          title: 'Homem-Aranha',
          overview: 'Sinopse',
          poster_path: '/poster.jpg',
          release_date: '2026-07-29',
        }),
    });

    const result = await buildService().getMovieById('969681');

    expect(result).toMatchObject({ tmdbId: '969681', title: 'Homem-Aranha' });
  });

  it('throws ServiceUnavailableError (not NotFound) on a 5xx from TMDb', async () => {
    mockFetchResponse({ ok: false, status: 503 });

    await expect(buildService().getMovieById('969681')).rejects.toThrow(
      ServiceUnavailableError,
    );
  });

  it('throws ServiceUnavailableError on a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    );

    await expect(buildService().getMovieById('969681')).rejects.toThrow(
      ServiceUnavailableError,
    );
  });

  it('throws ServiceUnavailableError when listing now-playing movies fails', async () => {
    mockFetchResponse({ ok: false, status: 429 });

    await expect(buildService().listNowPlaying(1)).rejects.toThrow(
      ServiceUnavailableError,
    );
  });

  it('returns items alongside TMDb pagination metadata', async () => {
    mockFetchResponse({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          page: 2,
          total_pages: 5,
          total_results: 93,
          results: [
            {
              id: 969681,
              title: 'Homem-Aranha',
              overview: 'Sinopse',
              poster_path: '/poster.jpg',
              release_date: '2026-07-29',
            },
          ],
        }),
    });

    const result = await buildService().listNowPlaying(2);

    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(5);
    expect(result.totalResults).toBe(93);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ tmdbId: '969681' });
  });

  it('retries a transient 503 and succeeds once TMDb recovers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, headers: new Headers() })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 969681,
            title: 'Homem-Aranha',
            overview: null,
            poster_path: null,
            release_date: null,
          }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await buildService().getMovieById('969681');

    expect(result?.title).toBe('Homem-Aranha');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 400, failing on the first attempt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(buildService().getMovieById('969681')).rejects.toThrow(
      ServiceUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
