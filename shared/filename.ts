import type { DetectedMedia } from './types';

/** Characters forbidden in filenames on Windows/macOS/Linux */
const FORBIDDEN = /[\\/:*?"<>|]/g;

/** Max filename length (without extension) */
const MAX_NAME_LEN = 150;

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const GENERIC_NAMES = new Set([
  'master',
  'index',
  'playlist',
  'chunklist',
  'manifest',
  'stream',
  'video',
  'media',
  'output',
  'prog_index',
  'main',
  '720p',
  '1080p',
  '480p',
  '360p',
  'hls',
  'dash',
  'seg',
  'segment',
]);

/**
 * Clean common site branding, separators, and suffixes from page/video titles.
 * E.g.: "Video Title - YouTube" -> "Video Title"
 * "My Video | Watch Free Online" -> "My Video"
 */
export function cleanVideoTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let title = rawTitle.trim();

  // Strip common trailing site branding: " - SiteName", " | SiteName", " — SiteName", " // SiteName"
  const suffixPattern = /\s+(?:[-–—|/•»]\s+[^|–—/•»]+)$/;
  for (let i = 0; i < 2; i++) {
    const match = title.match(suffixPattern);
    if (match && title.length - match[0].length >= 3) {
      title = title.slice(0, title.length - match[0].length).trim();
    }
  }

  return title;
}

/**
 * Build a sanitized filename from template + media info.
 * Template tokens: {title}, {quality}, {domain}, {date}
 */
export function buildFilename(
  template: string,
  media: DetectedMedia,
  ext?: string,
): string {
  const quality = bestQualityLabel(media);
  const date = new Date().toISOString().slice(0, 10);

  // Extract clean video title, avoiding generic "master", "index", etc.
  let rawTitle = media.pageTitle || '';
  let title = cleanVideoTitle(rawTitle);

  if (!title || title.toLowerCase() === 'video' || title.toLowerCase() === 'untitled') {
    title = extractNameFromUrl(media.url) || media.domain || 'video';
  }

  let name = template
    .replace(/\{title\}/gi, title)
    .replace(/\{domain\}/gi, media.domain)
    .replace(/\{date\}/gi, date);

  if (quality) {
    name = name.replace(/\{quality\}/gi, quality);
  } else {
    // If quality is empty, remove {quality} along with any preceding separator like _{quality}
    name = name.replace(/[-_]?\{quality\}/gi, '');
  }

  // Sanitize
  name = sanitize(name);

  // Determine extension
  const finalExt = ext || extFromUrl(media.url) || extFromMime(media.mime) || 'mp4';

  return `${name}.${finalExt}`;
}

/** Remove forbidden chars, collapse whitespace, trim, enforce max length */
export function sanitize(name: string): string {
  let clean = name.replace(FORBIDDEN, '_').replace(/\s+/g, ' ').trim();
  // Remove trailing dots, spaces, underscores, hyphens
  clean = clean.replace(/[. _-]+$/, '');
  // If only underscores/whitespace remain, treat as empty
  if (/^[_\s-]*$/.test(clean)) clean = '';
  if (WINDOWS_RESERVED.test(clean)) {
    clean = `${clean}_file`;
  }
  if (clean.length > MAX_NAME_LEN) {
    clean = clean.slice(0, MAX_NAME_LEN).trimEnd();
  }
  return clean || 'video';
}

function bestQualityLabel(media: DetectedMedia): string {
  if (!media.variants?.length) return '';
  // Pick highest resolution
  const sorted = [...media.variants].sort(
    (a, b) => (b.resolution?.height ?? 0) - (a.resolution?.height ?? 0),
  );
  return sorted[0]?.label ?? '';
}

export function extractNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // 1. Check query parameters for title/name/id
    const qTitle =
      parsed.searchParams.get('title') ||
      parsed.searchParams.get('name') ||
      parsed.searchParams.get('v') ||
      parsed.searchParams.get('vid');
    if (qTitle && qTitle.trim().length > 1) {
      return decodeURIComponent(qTitle.trim());
    }

    // 2. Walk path segments from right to left, skipping generic manifest names
    const segments = parsed.pathname.split('/').filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i]!.replace(/\.[^.]+$/, '');
      const lower = seg.toLowerCase();
      if (!GENERIC_NAMES.has(lower) && !/^\d+$/.test(seg) && seg.length > 2) {
        return decodeURIComponent(seg);
      }
    }

    // 3. Fallback to last segment if nothing else
    const last = segments[segments.length - 1]?.replace(/\.[^.]+$/, '') ?? '';
    return last;
  } catch {
    return '';
  }
}

function extFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    return match?.[1]?.toLowerCase() ?? '';
  } catch {
    return '';
  }
}

function extFromMime(mime?: string): string {
  if (!mime) return '';
  const map: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/x-m4v': 'm4v',
    'video/quicktime': 'mov',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
  };
  return map[mime.split(';')[0]?.trim().toLowerCase() ?? ''] ?? '';
}
