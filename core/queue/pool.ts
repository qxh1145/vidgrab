import { log } from '../../shared/logger';

/**
 * T3.2: Concurrent download pool with pause/resume/abort, retry with backoff.
 */

export interface PoolJob<T = unknown> {
  id: number | string;
  data: T;
}

export interface PoolOptions<T> {
  concurrency: number;
  worker: (job: PoolJob<T>, signal: AbortSignal) => Promise<void>;
  onProgress?: (done: number, total: number, job: PoolJob<T>) => void;
  onError?: (job: PoolJob<T>, error: unknown, retries: number) => void;
}

export interface Pool<T> {
  add: (jobs: PoolJob<T>[]) => void;
  pause: () => void;
  resume: () => void;
  abort: () => void;
  setConcurrency: (n: number) => void;
  /** Resolves when all jobs complete or pool is aborted. */
  done: () => Promise<void>;
}

const MAX_RETRIES = 5;
const BACKOFF_BASE = [1000, 2000, 4000, 8000, 16000];
const CONSECUTIVE_FAIL_THRESHOLD = 20;

export function createPool<T>(options: PoolOptions<T>): Pool<T> {
  let concurrency = options.concurrency;
  let paused = false;
  let aborted = false;

  const queue: PoolJob<T>[] = [];
  let running = 0;
  let done = 0;
  let total = 0;
  let consecutiveFails = 0;

  const abortController = new AbortController();
  // Per-job controllers for individual cancellation
  const jobControllers = new Set<AbortController>();

  let resolveAllDone: (() => void) | null = null;
  let rejectAllDone: ((err: unknown) => void) | null = null;
  const allDonePromise = new Promise<void>((resolve, reject) => {
    resolveAllDone = resolve;
    rejectAllDone = reject;
  });

  // Resume waiting runners
  let resumeWaiters: (() => void)[] = [];

  function checkDone(): void {
    if (running === 0 && queue.length === 0 && resolveAllDone) {
      resolveAllDone();
    }
  }

  async function waitIfPaused(): Promise<void> {
    while (paused && !aborted) {
      await new Promise<void>((r) => resumeWaiters.push(r));
    }
  }

  async function runJob(job: PoolJob<T>): Promise<void> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (aborted) return;
      await waitIfPaused();
      if (aborted) return;

      const jc = new AbortController();
      jobControllers.add(jc);

      // Link to global abort
      const onAbort = () => jc.abort();
      abortController.signal.addEventListener('abort', onAbort, { once: true });

      try {
        await options.worker(job, jc.signal);
        jobControllers.delete(jc);
        abortController.signal.removeEventListener('abort', onAbort);
        consecutiveFails = 0;
        done++;
        options.onProgress?.(done, total, job);
        return;
      } catch (err) {
        jobControllers.delete(jc);
        abortController.signal.removeEventListener('abort', onAbort);
        lastErr = err;

        if (aborted || jc.signal.aborted) return;

        consecutiveFails++;
        options.onError?.(job, err, attempt);

        // Auto-pause on too many consecutive failures
        if (consecutiveFails >= CONSECUTIVE_FAIL_THRESHOLD) {
          log.warn('Pool auto-paused: too many consecutive failures');
          paused = true;
          // Don't retry further for this job
          break;
        }

        // Check if 403/404 → no retry
        if (isHttpStatus(err, 403) || isHttpStatus(err, 404)) {
          if (attempt >= MAX_RETRIES) break;
        }

        // Backoff with jitter
        if (attempt < MAX_RETRIES) {
          const base = BACKOFF_BASE[attempt] ?? 16000;
          const jitter = Math.random() * base * 0.3;
          await sleep(base + jitter);
        }
      }
    }
    // All retries exhausted
    log.warn('Job failed after retries', job.id, lastErr);
  }

  async function scheduleNext(): Promise<void> {
    while (queue.length > 0 && running < concurrency && !aborted) {
      await waitIfPaused();
      if (aborted || queue.length === 0) break;

      const job = queue.shift()!;
      running++;
      runJob(job).finally(() => {
        running--;
        scheduleNext();
        checkDone();
      });
    }
  }

  return {
    add(jobs) {
      queue.push(...jobs);
      total += jobs.length;
      scheduleNext();
    },

    pause() {
      paused = true;
    },

    resume() {
      if (!paused) return;
      paused = false;
      const waiters = resumeWaiters;
      resumeWaiters = [];
      waiters.forEach((r) => r());
      scheduleNext();
    },

    abort() {
      aborted = true;
      abortController.abort();
      for (const jc of jobControllers) jc.abort();
      jobControllers.clear();
      queue.length = 0;
      // Release paused waiters
      resumeWaiters.forEach((r) => r());
      resumeWaiters = [];
      resolveAllDone?.();
    },

    setConcurrency(n) {
      concurrency = n;
      // If increasing, schedule more
      if (!paused && !aborted) scheduleNext();
    },

    done() {
      // If nothing was added, resolve immediately
      if (total === 0) return Promise.resolve();
      return allDonePromise;
    },
  };
}

function isHttpStatus(err: unknown, status: number): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as { status: number }).status === status
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
