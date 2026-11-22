import { createPool, type PoolJob } from '../queue/pool';
import { fetchBuffer, fetchText } from '../net/fetch-retry';
import {
  writeTrackSegment,
  hasTrackSegment,
} from '../storage/opfs';
import { parseMpd, type ParsedDash } from './parser';
import { log } from '../../shared/logger';

export interface DashDownloadOptions {
  taskId: string;
  mpdUrl: string;
  selectedTrackId?: string;
  threads: number;
  requestHeaders?: Record<string, string>;
  onProgress?: (done: number, total: number, bytes: number) => void;
  onStatusChange?: (status: string) => void;
  onError?: (err: string) => void;
}

export interface DashDownloadResult {
  totalSegments: number;
  videoSegments: number;
  audioSegments: number;
  hasAudio: boolean;
  aborted: boolean;
  parsed: ParsedDash;
}

export interface DashDownloadController {
  pause: () => void;
  resume: () => void;
  abort: () => void;
  setThreads: (n: number) => void;
  done: () => Promise<DashDownloadResult>;
}

interface DashJobData {
  track: 'video' | 'audio';
  idx: number;
  url: string;
}

export async function startDashDownload(
  options: DashDownloadOptions,
): Promise<DashDownloadController> {
  const {
    taskId,
    mpdUrl,
    selectedTrackId,
    threads,
    requestHeaders = {},
    onProgress,
    onStatusChange,
    onError,
  } = options;

  log.info('Starting DASH download for task', taskId, mpdUrl);

  // 1. Fetch MPD manifest
  const mpdText = await fetchText(mpdUrl, {
    headers: requestHeaders,
  });

  // 2. Parse MPD
  const parsed = parseMpd(mpdText, mpdUrl);

  if (parsed.videoTracks.length === 0 && parsed.audioTracks.length === 0) {
    throw new Error('Không tìm thấy luồng video hoặc audio nào trong file MPD.');
  }

  // 3. Select video track (default: highest bandwidth)
  const videoTrack = selectedTrackId
    ? parsed.videoTracks.find((t) => t.id === selectedTrackId) || parsed.videoTracks[0]
    : parsed.videoTracks.reduce(
        (best, cur) => (cur.bandwidth > (best?.bandwidth ?? 0) ? cur : best),
        parsed.videoTracks[0],
      );

  // Select audio track
  const audioTrack = parsed.audioTracks[0];

  const videoSegments = videoTrack?.segments ?? [];
  const audioSegments = audioTrack?.segments ?? [];
  const totalSegments = videoSegments.length + audioSegments.length;

  log.info(
    `DASH: ${videoSegments.length} video segments (${videoTrack?.label || 'none'}), ${
      audioSegments.length
    } audio segments`,
  );

  let totalBytes = 0;
  let aborted = false;

  // 4. Download init segments first
  if (videoTrack?.initUrl) {
    try {
      if (!(await hasTrackSegment(taskId, 'video', -1))) {
        const initBuf = await fetchBuffer(videoTrack.initUrl, { headers: requestHeaders });
        await writeTrackSegment(taskId, 'video', -1, initBuf);
        totalBytes += initBuf.byteLength;
      }
    } catch (e) {
      log.warn('Failed to fetch video init segment', e);
    }
  }

  if (audioTrack?.initUrl) {
    try {
      if (!(await hasTrackSegment(taskId, 'audio', -1))) {
        const initBuf = await fetchBuffer(audioTrack.initUrl, { headers: requestHeaders });
        await writeTrackSegment(taskId, 'audio', -1, initBuf);
        totalBytes += initBuf.byteLength;
      }
    } catch (e) {
      log.warn('Failed to fetch audio init segment', e);
    }
  }

  // 5. Build jobs
  const jobs: PoolJob<DashJobData>[] = [];
  let alreadyDoneCount = 0;

  // Video segment jobs
  for (const seg of videoSegments) {
    if (await hasTrackSegment(taskId, 'video', seg.idx)) {
      alreadyDoneCount++;
    } else {
      jobs.push({
        id: `v-${seg.idx}`,
        data: { track: 'video', idx: seg.idx, url: seg.url },
      });
    }
  }

  // Audio segment jobs
  for (const seg of audioSegments) {
    if (await hasTrackSegment(taskId, 'audio', seg.idx)) {
      alreadyDoneCount++;
    } else {
      jobs.push({
        id: `a-${seg.idx}`,
        data: { track: 'audio', idx: seg.idx, url: seg.url },
      });
    }
  }

  let doneCount = alreadyDoneCount;
  if (doneCount > 0) {
    onProgress?.(doneCount, totalSegments, totalBytes);
  }

  // 6. Download pool
  const pool = createPool<DashJobData>({
    concurrency: threads,
    worker: async (job, signal) => {
      const { track, idx, url } = job.data;
      const data = await fetchBuffer(url, {
        headers: requestHeaders,
        signal,
      });
      await writeTrackSegment(taskId, track, idx, data);
      totalBytes += data.byteLength;
      doneCount++;
      onProgress?.(doneCount, totalSegments, totalBytes);
    },
    onError: (job, err) => {
      onError?.(`Lỗi tải segment ${job.id}: ${(err as Error).message}`);
    },
  });

  const completionPromise = (async (): Promise<DashDownloadResult> => {
    pool.add(jobs);
    await pool.done();

    return {
      totalSegments,
      videoSegments: videoSegments.length,
      audioSegments: audioSegments.length,
      hasAudio: Boolean(audioTrack && audioSegments.length > 0),
      aborted,
      parsed,
    };
  })();

  return {
    pause: () => {
      pool.pause();
      onStatusChange?.('paused');
    },
    resume: () => {
      pool.resume();
      onStatusChange?.('running');
    },
    abort: () => {
      aborted = true;
      pool.abort();
      onStatusChange?.('cancelled');
    },
    setThreads: (n) => {
      pool.setConcurrency(n);
    },
    done: () => completionPromise,
  };
}
