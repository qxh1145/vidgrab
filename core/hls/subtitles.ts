/**
 * T7.2: VTT Subtitles downloader and merger.
 * Downloads segmented WebVTT from HLS master playlists, concatenates them into
 * a standard, single .vtt subtitle file, and triggers download.
 */

import { fetchText } from '../net/fetch-retry';
import { parseMedia, type SubtitleTrack } from './parser';
import { log } from '../../shared/logger';

export function mergeVttSegments(segmentsText: string[]): string {
  if (segmentsText.length === 0) return 'WEBVTT\n\n';

  const output: string[] = ['WEBVTT\n\n'];

  for (let i = 0; i < segmentsText.length; i++) {
    const raw = segmentsText[i]!;
    // Split into lines
    const lines = raw.split(/\r?\n/);
    const cleanedLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip WEBVTT headers and timestamp map tags in subsequent segments
      if (trimmed.startsWith('WEBVTT') || trimmed.startsWith('X-TIMESTAMP-MAP')) {
        continue;
      }
      cleanedLines.push(line);
    }

    const content = cleanedLines.join('\n').trim();
    if (content) {
      output.push(content + '\n\n');
    }
  }

  return output.join('').trim() + '\n';
}

export async function downloadVttSubtitles(
  track: SubtitleTrack,
  baseFilename: string,
  requestHeaders: Record<string, string> = {},
): Promise<{ filename: string; content: string }> {
  if (!track.uri) {
    throw new Error('Đường dẫn phụ đề (URI) không hợp lệ.');
  }

  log.info('Fetching subtitle playlist', track.name, track.uri);
  const playlistText = await fetchText(track.uri, { headers: requestHeaders });
  const media = parseMedia(playlistText, track.uri);

  const segmentTexts: string[] = [];
  for (const seg of media.segments) {
    try {
      const segText = await fetchText(seg.url, { headers: requestHeaders });
      segmentTexts.push(segText);
    } catch (e) {
      log.warn('Could not fetch subtitle segment', seg.url, e);
    }
  }

  const merged = mergeVttSegments(segmentTexts);
  const lang = track.language || track.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'sub';
  const cleanBase = baseFilename.replace(/\.[^/.]+$/, '');
  const filename = `${cleanBase}.${lang}.vtt`;

  // Trigger browser download if running in extension environment
  if (typeof browser !== 'undefined' && browser.downloads) {
    const blob = new Blob([merged], { type: 'text/vtt' });
    const url = URL.createObjectURL(blob);
    await browser.downloads.download({
      url,
      filename,
      conflictAction: 'uniquify',
    });
  }

  return { filename, content: merged };
}
