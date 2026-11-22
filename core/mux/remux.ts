import muxjs, { type TransmuxerSegment } from 'mux.js';
import {
  readSegment,
  openOutput,
  hasSegment,
  readTrackSegment,
  hasTrackSegment,
} from '../storage/opfs';
import { log } from '../../shared/logger';

export interface MergeOptions {
  taskId: string;
  videoSegments: number;
  audioSegments: number;
  hasAudio: boolean;
  outputName: string;
  onProgress?: (done: number, total: number) => void;
}

export async function mergeTracks(options: MergeOptions): Promise<void> {
  const { taskId, videoSegments, audioSegments, hasAudio, outputName, onProgress } = options;

  if (typeof Worker !== 'undefined') {
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL('./merge.worker.ts', import.meta.url),
        { type: 'module' },
      );

      worker.onmessage = (e: MessageEvent) => {
        const data = e.data;
        if (data.type === 'PROGRESS') {
          onProgress?.(data.done, data.total);
        } else if (data.type === 'DONE') {
          worker.terminate();
          resolve();
        } else if (data.type === 'ERROR') {
          worker.terminate();
          reject(new Error(data.error));
        }
      };

      worker.onerror = (err) => {
        worker.terminate();
        reject(new Error(`Merge worker error: ${err.message}`));
      };

      worker.postMessage({
        type: 'START_MERGE',
        taskId,
        videoSegments,
        audioSegments,
        hasAudio,
        outputName,
      });
    });
  }

  // Fallback for non-worker environment (e.g. tests)
  const outputStream = await openOutput(taskId, outputName);
  if (await hasTrackSegment(taskId, 'video', -1)) {
    const init = await readTrackSegment(taskId, 'video', -1);
    await outputStream.write(init);
  }
  for (let i = 0; i < videoSegments; i++) {
    const seg = await readTrackSegment(taskId, 'video', i);
    await outputStream.write(seg);
    onProgress?.(i + 1, videoSegments);
  }
  await outputStream.close();
}

export interface RemuxOptions {
  taskId: string;
  totalSegments: number;
  isFmp4: boolean;
  outputName: string;
  discontinuities?: number[];
  onProgress?: (done: number, total: number) => void;
}

/**
 * Streamingly remuxes downloaded segments in OPFS to a single MP4 file.
 * Memory overhead is constant O(1) buffer per segment (~1-5MB).
 */
export async function remuxToMp4(options: RemuxOptions): Promise<void> {
  const { taskId, totalSegments, isFmp4, outputName, discontinuities, onProgress } = options;
  const discontSet = new Set(discontinuities ?? []);

  // Try running in Web Worker if available
  if (typeof Worker !== 'undefined') {
    try {
      await runInWorker(options);
      return;
    } catch (workerErr) {
      log.warn('Worker remux failed, falling back to direct stream remux:', workerErr);
    }
  }

  // Direct streaming remux
  await directStreamRemux(taskId, totalSegments, isFmp4, outputName, discontSet, onProgress);
}

function runInWorker(options: RemuxOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./ts2mp4.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (e: MessageEvent) => {
      const data = e.data;
      if (data.type === 'PROGRESS') {
        options.onProgress?.(data.done, data.total);
      } else if (data.type === 'DONE') {
        worker.terminate();
        resolve();
      } else if (data.type === 'ERROR') {
        worker.terminate();
        reject(new Error(data.error));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    worker.postMessage({
      type: 'START_REMUX',
      taskId: options.taskId,
      totalSegments: options.totalSegments,
      isFmp4: options.isFmp4,
      outputName: options.outputName,
      discontinuities: options.discontinuities,
    });
  });
}

async function directStreamRemux(
  taskId: string,
  totalSegments: number,
  isFmp4: boolean,
  outputName: string,
  discontSet: Set<number>,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const outputStream = await openOutput(taskId, outputName);

  if (isFmp4) {
    const hasInit = await hasSegment(taskId, -1);
    if (hasInit) {
      const initData = await readSegment(taskId, -1);
      await outputStream.write(initData);
    }

    for (let i = 0; i < totalSegments; i++) {
      const segData = await readSegment(taskId, i);
      await outputStream.write(segData);
      onProgress?.(i + 1, totalSegments);
    }
  } else {
    const transmuxer = new muxjs.mp4.Transmuxer({
      keepOriginalTimestamps: true,
    });

    let hasWrittenInit = false;
    const chunksQueue: BufferSource[] = [];

    transmuxer.on('data', (segment: TransmuxerSegment) => {
      if (!hasWrittenInit && segment.initSegment && segment.initSegment.byteLength > 0) {
        chunksQueue.push(segment.initSegment as unknown as BufferSource);
        hasWrittenInit = true;
      }
      if (segment.data && segment.data.byteLength > 0) {
        chunksQueue.push(segment.data as unknown as BufferSource);
      }
    });

    for (let i = 0; i < totalSegments; i++) {
      if (discontSet.has(i)) {
        chunksQueue.length = 0;
        transmuxer.flush();
        for (const chunk of chunksQueue) {
          await outputStream.write(chunk);
        }
        chunksQueue.length = 0;
        transmuxer.endTimeline();
        transmuxer.reset();
      }

      const raw = await readSegment(taskId, i);
      const uint8 = new Uint8Array(raw);
      chunksQueue.length = 0;
      transmuxer.push(uint8);
      transmuxer.flush();

      for (const chunk of chunksQueue) {
        await outputStream.write(chunk);
      }
      chunksQueue.length = 0;

      onProgress?.(i + 1, totalSegments);
    }

    transmuxer.dispose();
  }

  await outputStream.close();
}
