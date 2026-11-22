/**
 * T7.1: HLS Livestream Downloader.
 * Polls media playlist every targetDuration seconds, tracks media sequence numbers,
 * prevents duplicate segment downloads, and supports "Stop & Save".
 */

import { parseMedia, type ParsedMedia } from './parser';
import { fetchBuffer, fetchText } from '../net/fetch-retry';
import { writeSegment, hasSegment } from '../storage/opfs';
import { remuxToMp4 } from '../mux/remux';
import { log } from '../../shared/logger';

export interface LiveHlsOptions {
  taskId: string;
  playlistUrl: string;
  requestHeaders?: Record<string, string>;
  onProgress?: (doneSegments: number, bytesDownloaded: number, totalDuration: number) => void;
  onStatusChange?: (status: string) => void;
  onError?: (err: string) => void;
}

export interface LiveHlsController {
  stopAndSave: (outputName?: string) => Promise<{ totalSegments: number; totalDuration: number }>;
  abort: () => void;
}

export async function startLiveHlsDownload(
  options: LiveHlsOptions,
): Promise<LiveHlsController> {
  const {
    taskId,
    playlistUrl,
    requestHeaders = {},
    onProgress,
    onStatusChange,
    onError,
  } = options;

  let isPolling = true;
  let isAborted = false;
  let segmentIndex = 0;
  let bytesDownloaded = 0;
  let totalDuration = 0;
  const seenUrls = new Set<string>();

  // Fetch initial playlist to check targetDuration and map
  let initialText = await fetchText(playlistUrl, { headers: requestHeaders });
  let initialMedia = parseMedia(initialText, playlistUrl);

  const pollIntervalMs = Math.max(2000, ((initialMedia.targetDuration || 4) * 1000) * 0.8);
  log.info(`Livestream detected. Target duration: ${initialMedia.targetDuration}s, polling every ${pollIntervalMs}ms`);

  // Download init segment (fMP4) if present
  if (initialMedia.map) {
    try {
      const initBuf = await fetchBuffer(initialMedia.map.uri, { headers: requestHeaders });
      await writeSegment(taskId, -1, initBuf);
      bytesDownloaded += initBuf.byteLength;
    } catch (e) {
      log.warn('Could not download livestream init segment', e);
    }
  }

  async function downloadSegment(url: string, duration: number): Promise<void> {
    const idx = segmentIndex++;
    try {
      const data = await fetchBuffer(url, { headers: requestHeaders });
      await writeSegment(taskId, idx, data);
      bytesDownloaded += data.byteLength;
      totalDuration += duration;
      onProgress?.(segmentIndex, bytesDownloaded, totalDuration);
    } catch (err) {
      log.warn(`Live segment ${idx} failed`, err);
      onError?.(`Lỗi tải đoạn live ${idx}: ${(err as Error).message}`);
    }
  }

  // Poll loop
  async function poll() {
    while (isPolling && !isAborted) {
      try {
        const text = await fetchText(playlistUrl, { headers: requestHeaders });
        const media = parseMedia(text, playlistUrl);

        for (const seg of media.segments) {
          if (!seenUrls.has(seg.url)) {
            seenUrls.add(seg.url);
            await downloadSegment(seg.url, seg.duration);
          }
        }

        // If stream ended naturally (#EXT-X-ENDLIST)
        if (!media.isLive) {
          log.info('Livestream ended by host (EXT-X-ENDLIST)');
          break;
        }
      } catch (err) {
        log.warn('Poll playlist failed', err);
      }

      if (!isPolling || isAborted) break;
      await new Promise((res) => setTimeout(res, pollIntervalMs));
    }
  }

  // Start polling in background
  void poll();

  return {
    stopAndSave: async (outputName = 'live_output.mp4') => {
      isPolling = false;
      onStatusChange?.('merging');

      const isFmp4 = await hasSegment(taskId, -1);

      await remuxToMp4({
        taskId,
        totalSegments: segmentIndex,
        isFmp4,
        outputName,
      });

      onStatusChange?.('done');
      return { totalSegments: segmentIndex, totalDuration };
    },
    abort: () => {
      isPolling = false;
      isAborted = true;
      onStatusChange?.('cancelled');
    },
  };
}
