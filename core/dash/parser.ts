/**
 * T5.1: DASH MPD parser — wraps mpd-parser.
 * Detects DRM per GEMINI.md §2.
 */

import { parse as parseDashManifest } from 'mpd-parser';
import { DrmError } from '../hls/parser';
import type { Variant } from '../../shared/types';

export interface DashSegment {
  idx: number;
  url: string;
  duration: number;
  initUrl?: string;
}

export interface DashRepresentation {
  id: string;
  kind: 'video' | 'audio';
  bandwidth: number;
  resolution?: { width: number; height: number };
  codecs?: string;
  label: string;
  initUrl?: string;
  segments: DashSegment[];
}

export interface ParsedDash {
  duration: number;
  videoTracks: DashRepresentation[];
  audioTracks: DashRepresentation[];
  variants: Variant[];
}

const DASH_DRM_PATTERNS = [
  /<ContentProtection\b/i,
  /urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed/i, // Widevine
  /urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95/i, // PlayReady
  /urn:uuid:f239e769-efa3-4850-9c16-a903c6932efb/i, // FairPlay
  /cenc:pssh/i,
  /cenc:default_KID/i,
];

export function checkDashDrm(text: string): void {
  for (const pattern of DASH_DRM_PATTERNS) {
    if (pattern.test(text)) {
      throw new DrmError('Video được bảo vệ DRM (DASH ContentProtection), không hỗ trợ');
    }
  }
}

export function parseMpd(text: string, baseUrl: string): ParsedDash {
  // 1. DRM check
  checkDashDrm(text);

  // 2. Parse MPD manifest
  const manifest = parseDashManifest(text, { manifestUri: baseUrl });

  const duration = manifest.duration ?? 0;
  const videoTracks: DashRepresentation[] = [];
  const audioTracks: DashRepresentation[] = [];
  const variants: Variant[] = [];

  // Parse video playlists
  for (let i = 0; i < (manifest.playlists ?? []).length; i++) {
    const pl = manifest.playlists![i]!;
    const attrs = pl.attributes ?? {};
    const res = attrs.RESOLUTION;
    const bw = attrs.BANDWIDTH ?? 0;
    const height = res?.height ?? 0;
    const label = height ? `${height}p` : `${Math.round(bw / 1000)}k`;

    const segments: DashSegment[] = (pl.segments ?? []).map((seg, idx) => ({
      idx,
      url: seg.resolvedUri || seg.uri,
      duration: seg.duration,
      initUrl: seg.map?.resolvedUri || seg.map?.uri,
    }));

    const initUrl = segments[0]?.initUrl;

    const track: DashRepresentation = {
      id: String(attrs.NAME || `v${i + 1}`),
      kind: 'video',
      bandwidth: bw,
      resolution: res ? { width: res.width, height: res.height } : undefined,
      codecs: attrs.CODECS,
      label,
      initUrl,
      segments,
    };

    videoTracks.push(track);
    variants.push({
      url: baseUrl, // or variant identifier
      bandwidth: bw,
      resolution: track.resolution,
      codecs: track.codecs,
      label,
    });
  }

  // Parse audio media groups
  const audioGroups = manifest.mediaGroups?.AUDIO;
  if (audioGroups) {
    let audioCounter = 1;
    for (const group of Object.values(audioGroups)) {
      for (const trackInfo of Object.values(group)) {
        for (const pl of trackInfo.playlists ?? []) {
          const attrs = pl.attributes ?? {};
          const bw = attrs.BANDWIDTH ?? 0;

          const segments: DashSegment[] = (pl.segments ?? []).map((seg, idx) => ({
            idx,
            url: seg.resolvedUri || seg.uri,
            duration: seg.duration,
            initUrl: seg.map?.resolvedUri || seg.map?.uri,
          }));

          const initUrl = segments[0]?.initUrl;

          audioTracks.push({
            id: String(attrs.NAME || `a${audioCounter++}`),
            kind: 'audio',
            bandwidth: bw,
            codecs: attrs.CODECS,
            label: `${Math.round(bw / 1000)}k audio`,
            initUrl,
            segments,
          });
        }
      }
    }
  }

  return {
    duration,
    videoTracks,
    audioTracks,
    variants,
  };
}
