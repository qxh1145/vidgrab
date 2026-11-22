import type { DetectedMedia, Variant } from '../../shared/types';
import { log } from '../../shared/logger';
import { parseMaster, parseMedia } from '../hls/parser';

/**
 * T1.6: Enrich a detected media item with size/duration/variants.
 * Called on-demand when popup opens, not continuously.
 * Mutates and returns the item.
 */
export async function enrich(
  item: DetectedMedia,
  fetchFn: typeof fetch = fetch,
): Promise<DetectedMedia> {
  try {
    switch (item.kind) {
      case 'file':
        return await enrichFile(item, fetchFn);
      case 'hls':
        return await enrichHls(item, fetchFn);
      case 'dash':
        return await enrichDash(item, fetchFn);
      default:
        return item;
    }
  } catch (err) {
    log.warn('Enrich failed for', item.url, err);
    return item;
  }
}

function buildHeaders(item: DetectedMedia): Record<string, string> {
  const headers: Record<string, string> = {};
  if (item.requestHeaders?.['Referer']) {
    headers['Referer'] = item.requestHeaders['Referer'];
  }
  if (item.requestHeaders?.['Origin']) {
    headers['Origin'] = item.requestHeaders['Origin'];
  }
  return headers;
}

async function enrichFile(
  item: DetectedMedia,
  fetchFn: typeof fetch,
): Promise<DetectedMedia> {
  if (item.size) return item;

  const headers = buildHeaders(item);
  try {
    // 1. Try HEAD request first
    const resp = await fetchFn(item.url, { method: 'HEAD', headers });
    const cl = resp.headers.get('content-length');
    if (cl) {
      const size = parseInt(cl, 10);
      if (!isNaN(size) && size > 0) {
        item.size = size;
        return item;
      }
    }

    // 2. Fallback to GET with Range: bytes=0-0
    const resp2 = await fetchFn(item.url, {
      method: 'GET',
      headers: { ...headers, Range: 'bytes=0-0' },
    });
    const cr = resp2.headers.get('content-range');
    const match = cr?.match(/\/(\d+)/);
    if (match && match[1]) {
      const size = parseInt(match[1], 10);
      if (!isNaN(size) && size > 0) {
        item.size = size;
      }
    }
  } catch {
    // Offline or CORS/unreachable — leave as is
  }
  return item;
}

async function enrichHls(
  item: DetectedMedia,
  fetchFn: typeof fetch,
): Promise<DetectedMedia> {
  const headers = buildHeaders(item);
  try {
    const resp = await fetchFn(item.url, { headers });
    const text = await resp.text();

    if (text.includes('#EXT-X-STREAM-INF')) {
      // Master playlist: parse variants
      const master = parseMaster(text, item.url);
      if (master.variants.length > 0) {
        item.variants = master.variants;

        // Fetch first variant to determine video duration and estimate size
        const firstVariant = master.variants[0];
        if (firstVariant && !item.duration) {
          try {
            const vResp = await fetchFn(firstVariant.url, { headers });
            const vText = await vResp.text();
            if (vText.includes('#EXTINF')) {
              const media = parseMedia(vText, firstVariant.url);
              if (media.totalDuration > 0) {
                item.duration = Math.round(media.totalDuration * 100) / 100;
                if (firstVariant.bandwidth) {
                  item.size = Math.round((firstVariant.bandwidth * item.duration) / 8);
                }
              }
              if (media.isLive) {
                item.isLive = true;
              }
            }
          } catch {
            // Best effort for variant duration
          }
        }
      }
    } else if (text.includes('#EXTINF')) {
      // Media playlist: parse segments and calculate duration
      const media = parseMedia(text, item.url);
      if (media.totalDuration > 0) {
        item.duration = Math.round(media.totalDuration * 100) / 100;
      }
      if (media.isLive) {
        item.isLive = true;
      }
      if (item.variants?.[0]?.bandwidth && item.duration) {
        item.size = Math.round((item.variants[0].bandwidth * item.duration) / 8);
      }
    }
  } catch {
    // Playlist fetch error or DRM
  }
  return item;
}

async function enrichDash(
  item: DetectedMedia,
  fetchFn: typeof fetch,
): Promise<DetectedMedia> {
  const headers = buildHeaders(item);
  try {
    const resp = await fetchFn(item.url, { headers });
    const text = await resp.text();

    // 1. Parse duration: mediaPresentationDuration="PT1H2M30.5S"
    const durMatch = text.match(/mediaPresentationDuration="PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?"/i);
    if (durMatch) {
      const h = parseInt(durMatch[1] ?? '0', 10);
      const m = parseInt(durMatch[2] ?? '0', 10);
      const s = parseFloat(durMatch[3] ?? '0');
      const dur = h * 3600 + m * 60 + s;
      if (dur > 0) item.duration = dur;
    }

    // 2. Parse representations for video variants
    const repRegex = /<Representation\b([^>]+)>/gi;
    const variants: Variant[] = [];
    let match: RegExpExecArray | null;
    while ((match = repRegex.exec(text)) !== null) {
      const attrs = match[1]!;
      const bwMatch = attrs.match(/bandwidth="(\d+)"/i);
      const widthMatch = attrs.match(/width="(\d+)"/i);
      const heightMatch = attrs.match(/height="(\d+)"/i);
      const codecsMatch = attrs.match(/codecs="([^"]+)"/i);

      if (bwMatch || heightMatch) {
        const bw = bwMatch ? parseInt(bwMatch[1]!, 10) : 0;
        const height = heightMatch ? parseInt(heightMatch[1]!, 10) : 0;
        const width = widthMatch ? parseInt(widthMatch[1]!, 10) : 0;
        variants.push({
          url: item.url,
          bandwidth: bw,
          resolution: width && height ? { width, height } : undefined,
          codecs: codecsMatch?.[1],
          label: height ? `${height}p` : `${Math.round(bw / 1000)}k`,
        });
      }
    }

    if (variants.length > 0) {
      item.variants = variants;
      if (item.duration && variants[0]?.bandwidth) {
        item.size = Math.round((variants[0].bandwidth * item.duration) / 8);
      }
    }
  } catch {
    // Offline or parse error
  }
  return item;
}
