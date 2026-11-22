/**
 * T3.3: fetch with timeout, retry classification, and typed errors.
 */

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

const DEFAULT_TIMEOUT = 30_000;

export interface FetchTextResult {
  text: string;
  finalUrl: string;
}

/**
 * Fetch a URL and return the response as ArrayBuffer.
 * Throws FetchError with status and retryable flag.
 */
export async function fetchBuffer(
  url: string,
  init?: RequestInit & { timeout?: number },
): Promise<ArrayBuffer> {
  const timeout = init?.timeout ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const externalSignal = init?.signal;

  // Link external signal
  if (externalSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
  externalSignal?.addEventListener('abort', () => controller.abort(), { once: true });

  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(url, {
      credentials: 'include',
      ...init,
      signal: controller.signal,
    });

    if (!resp.ok) {
      const retryable = resp.status >= 500 || resp.status === 429;
      throw new FetchError(
        `HTTP ${resp.status} ${resp.statusText}`,
        resp.status,
        retryable,
      );
    }

    return await resp.arrayBuffer();
  } catch (err) {
    if (err instanceof FetchError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    // Network errors are retryable
    throw new FetchError(
      (err as Error).message || 'Network error',
      0,
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch and return text along with final response URL (following redirects).
 */
export async function fetchTextWithUrl(
  url: string,
  init?: RequestInit & { timeout?: number },
): Promise<FetchTextResult> {
  const timeout = init?.timeout ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const externalSignal = init?.signal;

  if (externalSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
  externalSignal?.addEventListener('abort', () => controller.abort(), { once: true });

  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(url, {
      credentials: 'include',
      ...init,
      signal: controller.signal,
    });

    if (!resp.ok) {
      const retryable = resp.status >= 500 || resp.status === 429;
      throw new FetchError(
        `HTTP ${resp.status} ${resp.statusText}`,
        resp.status,
        retryable,
      );
    }

    const text = await resp.text();
    return { text, finalUrl: resp.url || url };
  } catch (err) {
    if (err instanceof FetchError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new FetchError((err as Error).message || 'Network error', 0, true);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch and return text.
 */
export async function fetchText(
  url: string,
  init?: RequestInit & { timeout?: number },
): Promise<string> {
  const result = await fetchTextWithUrl(url, init);
  return result.text;
}
