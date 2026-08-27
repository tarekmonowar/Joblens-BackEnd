import { Logger } from '../../../utils/logger';
// Shared RapidAPI GET helper with retry + exponential backoff.
// Every source adapter calls this so the HTTP/retry logic lives in one place.
import axios, { AxiosError } from 'axios';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

/** Inputs for a single RapidAPI GET call. */
export interface RapidApiGetOptions {
  host: string; // e.g. "jobicy.p.rapidapi.com"
  path: string; // e.g. "/api/v2/remote-jobs"
  apiKey: string; // shared RapidAPI key
  params: Record<string, string | number>;
  logger: Logger;
}

/**
 * GETs a RapidAPI endpoint and returns the parsed body.
 * Retries up to 3× on transient failures (network error, 5xx, or 429); a
 * non-retryable error (e.g. 400/403) fails fast without wasting attempts.
 */
export async function rapidApiGet<T>(options: RapidApiGetOptions): Promise<T> {
  const { host, path, apiKey, params, logger } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await axios.get<T>(`https://${host}${path}`, {
        headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': host },
        params,
        timeout: REQUEST_TIMEOUT_MS,
      });
      return response.data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      const isRetryable =
        err instanceof AxiosError &&
        (!err.response ||
          err.response.status >= 500 ||
          err.response.status === 429);

      if (attempt < MAX_RETRIES && isRetryable) {
        const delayMs = INITIAL_BACKOFF_MS * 2 ** (attempt - 1);
        logger.warn(
          `${host}${path} attempt ${attempt} failed — retry in ${delayMs}ms`,
        );
        await sleep(delayMs);
      } else if (!isRetryable) {
        break; // permanent error — stop retrying
      }
    }
  }

  throw lastError ?? new Error(`${host}${path} failed after retries`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
