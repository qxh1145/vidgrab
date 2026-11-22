import muxjs, { type TransmuxerSegment } from 'mux.js';
import {
  readSegment,
  openOutput,
  hasSegment,
} from '../storage/opfs';

export interface RemuxWorkerInput {
  type: 'START_REMUX';
  taskId: string;
  totalSegments: number;
  isFmp4: boolean;
  outputName: string;
  discontinuities?: number[];
}

export type RemuxWorkerOutput =
  | { type: 'PROGRESS'; done: number; total: number }
  | { type: 'DONE'; outputName: string }
  | { type: 'ERROR'; error: string };

self.onmessage = async (e: MessageEvent<RemuxWorkerInput>) => {
  if (e.data.type !== 'START_REMUX') return;

  const { taskId, totalSegments, isFmp4, outputName, discontinuities } = e.data;
  const discontSet = new Set(discontinuities ?? []);

  try {
    const outputStream = await openOutput(taskId, outputName);

    if (isFmp4) {
      // fMP4 (EXT-X-MAP): write init segment (-1), then concatenate media fragments
      const hasInit = await hasSegment(taskId, -1);
      if (hasInit) {
        const initData = await readSegment(taskId, -1);
        await outputStream.write(initData);
      }

      for (let i = 0; i < totalSegments; i++) {
        const segData = await readSegment(taskId, i);
        await outputStream.write(segData);
        postMessage({
          type: 'PROGRESS',
          done: i + 1,
          total: totalSegments,
        } satisfies RemuxWorkerOutput);
      }
    } else {
      // TS: transmux each TS segment to fMP4 fragments using mux.js
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

        postMessage({
          type: 'PROGRESS',
          done: i + 1,
          total: totalSegments,
        } satisfies RemuxWorkerOutput);
      }

      transmuxer.dispose();
    }

    await outputStream.close();
    postMessage({ type: 'DONE', outputName } satisfies RemuxWorkerOutput);
  } catch (err) {
    postMessage({
      type: 'ERROR',
      error: (err as Error).message || 'Remux failed',
    } satisfies RemuxWorkerOutput);
  }
};
