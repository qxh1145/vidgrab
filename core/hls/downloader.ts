/**
 * T3.6: HLS segment downloader.
 * Downloads playlist → segments → OPFS, with resume support.
 */

import { parseMedia, parseMaster, type ParsedMedia } from './parser';
import { decryptAes128, fetchKey } from './aes';
import { createPool, type Pool, type PoolJob } from '../queue/pool';
import { writeSegment, hasSegment, createTaskDir } from '../storage/opfs';
import { fetchBuffer, fetchTextWithUrl } from '../net/fetch-retry';
import { applyHeaders } from '../net/header-rules';
import { log } from '../../shared/logger';
import type { SegmentInfo } from '../../shared/types';

export interface HlsDownloadOptions {
  taskId: string;
  playlistUrl: string;
  threads: number;
  requestHeaders?: Record<string, string>;
  onProgress?: (done: number, total: number, bytesDownloaded: number) => void;
  onStatusChange?: (status: string) => void;
  onError?: (error: string) => void;
}

export interface HlsDownloadController {
  pause: () => void;
  resume: () => void;
  abort: () => void;
  setThreads: (n: number) => void;
  /** Resolves when download completes or is aborted */
  done: () => Promise<HlsDownloadResult>;
}

export interface HlsDownloadResult {
  totalSegments: number;
  bytesDownloaded: number;
  aborted: boolean;
  /** Info needed for remux step */
  media: ParsedMedia;
  isFmp4: boolean;
}

/**
 * Start downloading an HLS stream.
 * Fetches the playlist, resolves segments, downloads with pool, writes to OPFS.
 */
export async function startHlsDownload(
  options: HlsDownloadOptions,
): Promise<HlsDownloadController> {
  const { taskId, playlistUrl, threads, requestHeaders } = options;

  await createTaskDir(taskId);
  options.onStatusChange?.('running');

  // Fetch playlist following redirects to get actual final URL
  const { text: playlistText, finalUrl: resolvedPlaylistUrl } =
    await fetchTextWithUrl(playlistUrl);
  let media: ParsedMedia;

  // Check if this is a master playlist — if so, pick highest quality
  if (playlistText.includes('#EXT-X-STREAM-INF')) {
    const master = parseMaster(playlistText, resolvedPlaylistUrl);
    // Pick highest bandwidth variant
    const best = master.variants.sort((a, b) => b.bandwidth - a.bandwidth)[0];
    if (!best) throw new Error('No variants found in master playlist');
    const { text: mediaText, finalUrl: resolvedMediaUrl } =
      await fetchTextWithUrl(best.url);
    media = parseMedia(mediaText, resolvedMediaUrl);
  } else {
    media = parseMedia(playlistText, resolvedPlaylistUrl);
  }

  const isFmp4 = !!media.map;
  const segments = media.segments;
  let bytesDownloaded = 0;
  let aborted = false;

  // Dynamically apply request headers to ALL discovered domains (playlist, segments, key server)
  if (requestHeaders && Object.keys(requestHeaders).length > 0) {
    const allDomains = new Set<string>();
    try { allDomains.add(new URL(playlistUrl).hostname); } catch {}
    try { allDomains.add(new URL(resolvedPlaylistUrl).hostname); } catch {}
    for (const s of segments) {
      try { allDomains.add(new URL(s.url).hostname); } catch {}
      if (s.key?.uri) {
        try { allDomains.add(new URL(s.key.uri).hostname); } catch {}
      }
    }
    if (media.map?.uri) {
      try { allDomains.add(new URL(media.map.uri).hostname); } catch {}
    }
    try {
      await applyHeaders(taskId, Array.from(allDomains), requestHeaders);
      log.debug('Applied DNR headers to all stream domains', Array.from(allDomains));
    } catch (e) {
      log.warn('Could not apply DNR headers to all stream domains', e);
    }
  }

  // Key cache: keyUri → ArrayBuffer
  const keyDataCache = new Map<string, ArrayBuffer>();

  // Download init segment for fMP4 if present
  if (media.map) {
    const mapExists = await hasSegment(taskId, -1);
    if (!mapExists) {
      const initData = await fetchBuffer(media.map.uri);
      await writeSegment(taskId, -1, initData);
      bytesDownloaded += initData.byteLength;
    }
  }

  // Filter out already-downloaded segments (resume support)
  const pendingJobs: PoolJob<SegmentInfo>[] = [];
  for (const seg of segments) {
    const exists = await hasSegment(taskId, seg.idx);
    if (!exists) {
      pendingJobs.push({ id: seg.idx, data: seg });
    }
  }

  const alreadyDone = segments.length - pendingJobs.length;
  let doneSoFar = alreadyDone;

  const pool = createPool<SegmentInfo>({
    concurrency: threads,
    worker: async (job, signal) => {
      const seg = job.data;

      // Build fetch options with byterange if needed
      const headers: Record<string, string> = {};
      if (seg.byterange) {
        const end = seg.byterange.offset + seg.byterange.length - 1;
        headers['Range'] = `bytes=${seg.byterange.offset}-${end}`;
      }

      let data = await fetchBuffer(seg.url, { signal, headers });

      // Decrypt if AES-128
      if (seg.key) {
        let keyData = keyDataCache.get(seg.key.uri);
        if (!keyData) {
          keyData = await fetchKey(seg.key.uri, signal);
          keyDataCache.set(seg.key.uri, keyData);
        }
        data = await decryptAes128(
          data,
          seg.key.uri,
          keyData,
          seg.key.iv,
          seg.idx,
        );
      }

      await writeSegment(taskId, seg.idx, data);
      bytesDownloaded += data.byteLength;
    },
    onProgress: (done, total, job) => {
      doneSoFar = alreadyDone + done;
      options.onProgress?.(doneSoFar, segments.length, bytesDownloaded);
    },
    onError: (job, error, retries) => {
      log.warn(`Segment ${job.id} failed (attempt ${retries + 1})`, error);
      options.onError?.(`Segment ${job.id} failed: ${(error as Error).message}`);
    },
  });

  pool.add(pendingJobs);

  // Initial progress report
  if (alreadyDone > 0) {
    options.onProgress?.(doneSoFar, segments.length, bytesDownloaded);
  }

  return {
    pause() {
      pool.pause();
      options.onStatusChange?.('paused');
    },
    resume() {
      pool.resume();
      options.onStatusChange?.('running');
    },
    abort() {
      aborted = true;
      pool.abort();
      options.onStatusChange?.('cancelled');
    },
    setThreads(n) {
      pool.setConcurrency(n);
    },
    async done(): Promise<HlsDownloadResult> {
      await pool.done();
      if (!aborted) {
        options.onStatusChange?.('merging');
      }
      return {
        totalSegments: segments.length,
        bytesDownloaded,
        aborted,
        media,
        isFmp4,
      };
    },
  };
}
