import { createFile } from 'mp4box';
import {
  readTrackSegment,
  openOutput,
  hasTrackSegment,
} from '../storage/opfs';

export interface MergeWorkerInput {
  type: 'START_MERGE';
  taskId: string;
  videoSegments: number;
  audioSegments: number;
  hasAudio: boolean;
  outputName: string;
}

export type MergeWorkerOutput =
  | { type: 'PROGRESS'; done: number; total: number }
  | { type: 'DONE'; outputName: string }
  | { type: 'ERROR'; error: string };

self.onmessage = async (e: MessageEvent<MergeWorkerInput>) => {
  if (e.data.type !== 'START_MERGE') return;

  const { taskId, videoSegments, audioSegments, hasAudio, outputName } = e.data;

  try {
    const outputStream = await openOutput(taskId, outputName);

    // If video-only or audio extraction not requested, write fMP4 init + segments
    if (!hasAudio || audioSegments === 0) {
      const hasInit = await hasTrackSegment(taskId, 'video', -1);
      if (hasInit) {
        const initData = await readTrackSegment(taskId, 'video', -1);
        await outputStream.write(initData);
      }

      for (let i = 0; i < videoSegments; i++) {
        const segData = await readTrackSegment(taskId, 'video', i);
        await outputStream.write(segData);
        postMessage({
          type: 'PROGRESS',
          done: i + 1,
          total: videoSegments,
        } satisfies MergeWorkerOutput);
      }

      await outputStream.close();
      postMessage({ type: 'DONE', outputName } satisfies MergeWorkerOutput);
      return;
    }

    // Merging video + audio using MP4Box
    const vFile = createFile();
    const aFile = createFile();
    const outFile = createFile();

    let outVTrackId: number | null = null;
    let outATrackId: number | null = null;

    let vFileOffset = 0;
    let aFileOffset = 0;

    // Helper to feed buffer into MP4Box
    const feed = (file: ReturnType<typeof createFile>, buf: ArrayBuffer, offset: number) => {
      const buffer = buf as ArrayBuffer & { fileStart: number };
      buffer.fileStart = offset;
      return file.appendBuffer(buffer);
    };

    // Set up video track listeners
    vFile.onReady = (info) => {
      const track = info.videoTracks[0] || info.tracks[0];
      if (track) {
        outVTrackId = outFile.addTrack({
          id: 1,
          type: 'video',
          width: track.video?.width || 1280,
          height: track.video?.height || 720,
          timescale: track.timescale,
          duration: track.duration,
          codec: track.codec,
        });
        vFile.setExtractionOptions(track.id, null, { nbSamples: 1000 });
      }
    };

    vFile.onSamples = (_trackId, _user, samples) => {
      if (outVTrackId === null) return;
      for (const s of samples) {
        outFile.addSample(outVTrackId, s.data, {
          duration: s.duration,
          dts: s.dts,
          cts: s.cts,
          is_sync: s.is_sync,
        });
      }
    };

    // Set up audio track listeners
    aFile.onReady = (info) => {
      const track = info.audioTracks[0] || info.tracks[0];
      if (track) {
        outATrackId = outFile.addTrack({
          id: 2,
          type: 'audio',
          timescale: track.timescale,
          duration: track.duration,
          codec: track.codec,
          samplerate: track.audio?.sample_rate || 44100,
          channel_count: track.audio?.channel_count || 2,
        });
        aFile.setExtractionOptions(track.id, null, { nbSamples: 1000 });
      }
    };

    aFile.onSamples = (_trackId, _user, samples) => {
      if (outATrackId === null) return;
      for (const s of samples) {
        outFile.addSample(outATrackId, s.data, {
          duration: s.duration,
          dts: s.dts,
          cts: s.cts,
          is_sync: s.is_sync,
        });
      }
    };

    // Feed video init
    if (await hasTrackSegment(taskId, 'video', -1)) {
      const init = await readTrackSegment(taskId, 'video', -1);
      vFileOffset += feed(vFile, init, vFileOffset);
    }

    // Feed audio init
    if (await hasTrackSegment(taskId, 'audio', -1)) {
      const init = await readTrackSegment(taskId, 'audio', -1);
      aFileOffset += feed(aFile, init, aFileOffset);
    }

    // Read and feed segments
    const totalSegments = videoSegments + audioSegments;
    let processed = 0;

    for (let i = 0; i < videoSegments; i++) {
      const seg = await readTrackSegment(taskId, 'video', i);
      vFileOffset += feed(vFile, seg, vFileOffset);
      processed++;
      postMessage({
        type: 'PROGRESS',
        done: processed,
        total: totalSegments,
      } satisfies MergeWorkerOutput);
    }

    for (let i = 0; i < audioSegments; i++) {
      const seg = await readTrackSegment(taskId, 'audio', i);
      aFileOffset += feed(aFile, seg, aFileOffset);
      processed++;
      postMessage({
        type: 'PROGRESS',
        done: processed,
        total: totalSegments,
      } satisfies MergeWorkerOutput);
    }

    vFile.flush();
    aFile.flush();

    // Export merged file
    const mergedBuffer = outFile.getBuffer();
    await outputStream.write(mergedBuffer);
    await outputStream.close();

    postMessage({ type: 'DONE', outputName } satisfies MergeWorkerOutput);
  } catch (err) {
    postMessage({
      type: 'ERROR',
      error: (err as Error).message || 'DASH Track merge failed',
    } satisfies MergeWorkerOutput);
  }
};
