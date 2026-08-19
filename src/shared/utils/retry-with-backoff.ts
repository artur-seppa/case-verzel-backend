export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  isRetryable: (error: unknown) => boolean;
  delayMsForError?: (error: unknown) => number | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < options.attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === options.attempts - 1;
      if (isLastAttempt || !options.isRetryable(error)) {
        throw error;
      }

      const explicitDelay = options.delayMsForError?.(error);
      const delay = explicitDelay ?? options.baseDelayMs * 2 ** attempt;
      await sleep(delay);
    }
  }

  throw lastError;
}
