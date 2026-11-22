/**
 * T3.4: HLS playlist parser — wraps m3u8-parser.
 * Detects DRM per GEMINI.md §2.
 */

import { Parser } from 'm3u8-parser';
import type { Variant, SegmentInfo } from '../../shared/types';

export class DrmError extends Error {
  constructor(message = 'Video is DRM-protected (not supported)') {
    super(message);
    this.name = 'DrmError';
  }
}

export interface ParsedMaster {
  variants: Variant[];
  audioGroups: AudioTrack[];
  subtitleGroups: SubtitleTrack[];
}

export interface AudioTrack {
  groupId: string;
  name: string;
  language?: string;
  uri?: string;
  default?: boolean;
}

export interface SubtitleTrack {
  groupId: string;
  name: string;
  language?: string;
  uri?: string;
}

export interface ParsedMedia {
  segments: SegmentInfo[];
  targetDuration: number;
  isLive: boolean;
  map?: { uri: string; byterange?: { offset: number; length: number } };
  totalDuration: number;
}

/**
 * Parse a master (multivariant) playlist.
 */
export function parseMaster(text: string, baseUrl: string): ParsedMaster {
  checkDrm(text);

  const parser = new Parser();
  parser.push(text);
  parser.end();
  const manifest = parser.manifest;

  const variants: Variant[] = (manifest.playlists ?? []).map(
    (p: Record<string, unknown>) => {
      const attrs = (p.attributes ?? {}) as Record<string, unknown>;
      const res = attrs.RESOLUTION as
        | { width: number; height: number }
        | undefined;
      const bw = (attrs.BANDWIDTH as number) ?? 0;
      const height = res?.height ?? 0;

      return {
        url: resolveUrl(p.uri as string, baseUrl),
        bandwidth: bw,
        resolution: res ? { width: res.width, height: res.height } : undefined,
        codecs: (attrs.CODECS as string) ?? undefined,
        label: height ? `${height}p` : `${Math.round(bw / 1000)}k`,
      };
    },
  );

  const audioGroups: AudioTrack[] = [];
  const subtitleGroups: SubtitleTrack[] = [];

  const mediaGroups = manifest.mediaGroups as Record<
    string,
    Record<string, Record<string, Record<string, unknown>>>
  > | undefined;

  if (mediaGroups?.AUDIO) {
    for (const [groupId, tracks] of Object.entries(mediaGroups.AUDIO)) {
      for (const [name, track] of Object.entries(tracks)) {
        audioGroups.push({
          groupId,
          name,
          language: (track.language as string) ?? undefined,
          uri: track.uri
            ? resolveUrl(track.uri as string, baseUrl)
            : undefined,
          default: (track.default as boolean) ?? false,
        });
      }
    }
  }

  if (mediaGroups?.SUBTITLES) {
    for (const [groupId, tracks] of Object.entries(mediaGroups.SUBTITLES)) {
      for (const [name, track] of Object.entries(tracks)) {
        subtitleGroups.push({
          groupId,
          name,
          language: (track.language as string) ?? undefined,
          uri: track.uri
            ? resolveUrl(track.uri as string, baseUrl)
            : undefined,
        });
      }
    }
  }

  return { variants, audioGroups, subtitleGroups };
}

/**
 * Parse a media (segment-level) playlist.
 */
export function parseMedia(text: string, baseUrl: string): ParsedMedia {
  checkDrm(text);

  const parser = new Parser();
  parser.push(text);
  parser.end();
  const manifest = parser.manifest;

  const isLive = !(manifest.endList as boolean | undefined);
  const targetDuration = (manifest.targetDuration as number) ?? 0;

  let mapInfo: ParsedMedia['map'] | undefined;

  const segments: SegmentInfo[] = (manifest.segments ?? []).map(
    (seg: Record<string, unknown>, idx: number) => {
      // EXT-X-MAP (init segment for fMP4)
      if (seg.map && !mapInfo) {
        const m = seg.map as Record<string, unknown>;
        mapInfo = {
          uri: resolveUrl(m.uri as string, baseUrl),
          byterange: m.byterange
            ? {
                offset: (m.byterange as Record<string, number>).offset ?? 0,
                length: (m.byterange as Record<string, number>).length ?? 0,
              }
            : undefined,
        };
      }

      const info: SegmentInfo = {
        idx,
        url: resolveUrl(seg.uri as string, baseUrl),
        duration: (seg.duration as number) ?? 0,
      };

      if (seg.byterange) {
        const br = seg.byterange as Record<string, number>;
        info.byterange = { offset: br.offset ?? 0, length: br.length ?? 0 };
      }

      if (seg.key) {
        const k = seg.key as Record<string, unknown>;
        const method = (k.method as string)?.toUpperCase();
        if (method === 'AES-128') {
          info.key = {
            method: 'AES-128',
            uri: resolveUrl(k.uri as string, baseUrl),
            iv: k.iv ? parseIv(k.iv as string) : undefined,
          };
        }
        // SAMPLE-AES caught by checkDrm already
      }

      if (seg.discontinuity) {
        info.discontinuity = true;
      }

      return info;
    },
  );

  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);

  return {
    segments,
    targetDuration,
    isLive,
    map: mapInfo,
    totalDuration,
  };
}

// --- DRM detection ---

const DRM_PATTERNS = [
  /METHOD=SAMPLE-AES/i,
  /KEYFORMAT\s*=\s*"(?!identity)/i, // KEYFORMAT other than "identity"
  /com\.apple\.streamingkeydelivery/i,
  /com\.widevine/i,
  /urn:uuid:edef8ba9/i, // Widevine
  /urn:uuid:9a04f079/i, // PlayReady
];

function checkDrm(text: string): void {
  for (const pattern of DRM_PATTERNS) {
    if (pattern.test(text)) {
      throw new DrmError();
    }
  }
}

// --- Helpers ---

export function resolveUrl(uri: string, base: string): string {
  if (!uri) return base;
  const clean = uri.trim().replace(/^["']|["']$/g, '').trim();

  try {
    const resolved = new URL(clean, base);

    // If the relative URI did not specify query parameters,
    // but the base playlist URL had query parameters (e.g. auth tokens, signatures),
    // inherit the query parameters from base.
    const baseUrl = new URL(base);
    if (!resolved.search && baseUrl.search) {
      resolved.search = baseUrl.search;
    }

    return resolved.href;
  } catch {
    return clean;
  }
}

function parseIv(iv: unknown): Uint8Array | undefined {
  if (!iv) return undefined;

  // m3u8-parser returns IV as a Uint32Array-like object {0: ..., 1: ..., 2: ..., 3: ...}
  // representing 4 big-endian 32-bit words
  if (typeof iv === 'object' && iv !== null && 0 in iv) {
    const obj = iv as Record<number, number>;
    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < 4; i++) {
      view.setUint32(i * 4, obj[i] ?? 0, false); // big-endian
    }
    return bytes;
  }

  // Fallback: hex string like 0x01234567...
  if (typeof iv === 'string') {
    const hex = iv.startsWith('0x') || iv.startsWith('0X') ? iv.slice(2) : iv;
    const bytes = new Uint8Array(16);
    const padded = hex.padStart(32, '0');
    for (let i = 0; i < 16; i++) {
      bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  return undefined;
}
