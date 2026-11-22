import type { MediaKind } from '../../shared/types';
import { isBlockedDomain } from '../../shared/constants';

export interface ClassifyOptions {
  minSizeKB?: number;
  rangeHeader?: string;
}

export interface ClassifyResult {
  kind: MediaKind;
  mime: string;
}

const HLS_MIMES = new Set([
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'audio/mpegurl',
]);

const DASH_MIMES = new Set(['application/dash+xml']);

const FILE_EXT_MAP: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
};

// Segments: .ts, .m4s, isolated .aac
const SEGMENT_EXT_REGEX = /\.(ts|m4s|aac)$/i;

// Segment/chunk/frag with numbers: chunk_1, segment-12, frag34
const CHUNK_NAME_REGEX = /(?:segment|chunk|frag)[-_/]?\d+/i;

const DEFAULT_MIN_SIZE_KB = 200;

/**
 * Classifies a network request into MediaKind or null. Pure function.
 */
export function classify(
  url: string,
  contentType?: string,
  contentLength?: number,
  options?: ClassifyOptions,
): ClassifyResult | null {
  // 1. Parse URL & check blocked domains
  let parsed: URL;
  try {
    parsed = new URL(url, 'https://dummy.local');
  } catch {
    return null;
  }

  if (parsed.hostname && isBlockedDomain(parsed.hostname)) {
    return null;
  }

  // 2. Reject Range headers that start at offset > 0
  if (options?.rangeHeader) {
    const rangeMatch = options.rangeHeader.match(/^bytes=(\d+)-/i);
    if (!rangeMatch || parseInt(rangeMatch[1] ?? '0', 10) > 0) {
      return null;
    }
  }

  // Normalize inputs
  const cleanMime = contentType
    ? contentType.split(';')[0]?.trim().toLowerCase() ?? ''
    : '';
  const pathname = parsed.pathname.toLowerCase();
  const extMatch = pathname.match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : '';

  // 3. HLS playlist (.m3u8 or HLS content-type)
  if (ext === 'm3u8' || HLS_MIMES.has(cleanMime)) {
    return {
      kind: 'hls',
      mime: cleanMime || 'application/vnd.apple.mpegurl',
    };
  }

  // 4. DASH manifest (.mpd or DASH content-type)
  if (ext === 'mpd' || DASH_MIMES.has(cleanMime)) {
    return {
      kind: 'dash',
      mime: cleanMime || 'application/dash+xml',
    };
  }

  // 5. Filter out segments
  if (ext && SEGMENT_EXT_REGEX.test('.' + ext)) {
    return null;
  }
  if (CHUNK_NAME_REGEX.test(pathname) || CHUNK_NAME_REGEX.test(parsed.search)) {
    return null;
  }

  // 6. Direct media files
  const isMediaExt = ext ? ext in FILE_EXT_MAP : false;
  const isMediaMime =
    cleanMime.startsWith('video/') || cleanMime.startsWith('audio/');

  if (isMediaExt || isMediaMime) {
    // Check file size threshold (only applies to files, not playlists)
    const minBytes = (options?.minSizeKB ?? DEFAULT_MIN_SIZE_KB) * 1024;
    if (contentLength !== undefined && contentLength < minBytes) {
      return null;
    }

    const mime =
      cleanMime && isMediaMime
        ? cleanMime
        : ext
          ? FILE_EXT_MAP[ext] ?? 'video/mp4'
          : 'video/mp4';

    return { kind: 'file', mime };
  }

  return null;
}
