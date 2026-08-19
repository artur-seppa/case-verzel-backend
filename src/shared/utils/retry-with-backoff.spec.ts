import { describe, expect, it, vi } from 'vitest';
import { retryWithBackoff } from './retry-with-backoff';

describe('retryWithBackoff', () => {
  it('returns the result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await retryWithBackoff(fn, {
      attempts: 3,
      baseDelayMs: 1,
      isRetryable: () => true,
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a retryable failure and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('ok');

    const result = await retryWithBackoff(fn, {
      attempts: 3,
      baseDelayMs: 1,
      isRetryable: () => true,
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting all attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      retryWithBackoff(fn, {
        attempts: 3,
        baseDelayMs: 1,
        isRetryable: () => true,
      }),
    ).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry an error the caller marks as non-retryable', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('bad request'));

    await expect(
      retryWithBackoff(fn, {
        attempts: 3,
        baseDelayMs: 1,
        isRetryable: () => false,
      }),
    ).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses the explicit delay for an error when provided', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce('ok');

    const start = Date.now();
    await retryWithBackoff(fn, {
      attempts: 2,
      baseDelayMs: 1000,
      isRetryable: () => true,
      delayMsForError: () => 5,
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
  });
});
