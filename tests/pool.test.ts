import { describe, it, expect, vi } from 'vitest';
import { createPool, type PoolJob } from '../core/queue/pool';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('createPool', () => {
  it('runs all jobs and resolves done()', async () => {
    const results: number[] = [];
    const pool = createPool<number>({
      concurrency: 2,
      worker: async (job) => {
        results.push(job.data);
      },
    });
    pool.add([
      { id: 1, data: 10 },
      { id: 2, data: 20 },
      { id: 3, data: 30 },
    ]);
    await pool.done();
    expect(results.sort()).toEqual([10, 20, 30]);
  });

  it('respects concurrency limit', async () => {
    let maxConcurrent = 0;
    let current = 0;
    const pool = createPool<number>({
      concurrency: 2,
      worker: async () => {
        current++;
        if (current > maxConcurrent) maxConcurrent = current;
        await delay(10);
        current--;
      },
    });
    pool.add(
      Array.from({ length: 6 }, (_, i) => ({ id: i, data: i })),
    );
    await pool.done();
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('calls onProgress for each completed job', async () => {
    const progress: number[] = [];
    const pool = createPool<number>({
      concurrency: 1,
      worker: async () => {},
      onProgress: (done) => progress.push(done),
    });
    pool.add([
      { id: 1, data: 1 },
      { id: 2, data: 2 },
    ]);
    await pool.done();
    expect(progress).toEqual([1, 2]);
  });

  it('retries failed jobs', async () => {
    let attempts = 0;
    const pool = createPool<number>({
      concurrency: 1,
      worker: async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
      },
    });
    pool.add([{ id: 1, data: 1 }]);
    await pool.done();
    expect(attempts).toBe(3);
  });

  it('pause() and resume() work', async () => {
    const results: number[] = [];
    const pool = createPool<number>({
      concurrency: 1,
      worker: async (job) => {
        results.push(job.data);
      },
    });
    pool.add([{ id: 1, data: 1 }]);
    pool.pause();
    pool.add([{ id: 2, data: 2 }]);

    // Give time for job 1 to potentially complete
    await delay(50);

    // Resume and wait
    pool.resume();
    await pool.done();
    expect(results).toContain(1);
    expect(results).toContain(2);
  });

  it('abort() stops processing', async () => {
    const results: number[] = [];
    const pool = createPool<number>({
      concurrency: 1,
      worker: async (job) => {
        await delay(50);
        results.push(job.data);
      },
    });
    pool.add(
      Array.from({ length: 10 }, (_, i) => ({ id: i, data: i })),
    );
    await delay(10);
    pool.abort();
    await pool.done();
    expect(results.length).toBeLessThan(10);
  });

  it('setConcurrency() changes limit while running', async () => {
    let maxConcurrent = 0;
    let current = 0;
    const pool = createPool<number>({
      concurrency: 1,
      worker: async () => {
        current++;
        if (current > maxConcurrent) maxConcurrent = current;
        await delay(20);
        current--;
      },
    });
    pool.add(
      Array.from({ length: 8 }, (_, i) => ({ id: i, data: i })),
    );
    // After a short delay, bump concurrency
    await delay(5);
    pool.setConcurrency(4);
    await pool.done();
    // maxConcurrent should have gone above 1
    expect(maxConcurrent).toBeGreaterThan(1);
  });

  it('done() resolves immediately if nothing added', async () => {
    const pool = createPool<number>({
      concurrency: 2,
      worker: async () => {},
    });
    await pool.done();
  });
});
