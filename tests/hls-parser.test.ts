import { describe, it, expect } from 'vitest';
import { parseMaster, parseMedia, DrmError } from '../core/hls/parser';

// --- Sample playlists ---

const MASTER_BASIC = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.42e015,mp4a.40.2"
360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=1280x720,CODECS="avc1.42e01e,mp4a.40.2"
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1920x1080,CODECS="avc1.42e028,mp4a.40.2"
1080p.m3u8
`;

const MEDIA_TS = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:9.009,
seg0.ts
#EXTINF:9.009,
seg1.ts
#EXTINF:3.003,
seg2.ts
#EXT-X-ENDLIST
`;

const MEDIA_FMP4 = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:6
#EXT-X-MAP:URI="init.mp4"
#EXTINF:6.000,
seg0.m4s
#EXTINF:6.000,
seg1.m4s
#EXT-X-ENDLIST
`;

const MEDIA_AES128 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-KEY:METHOD=AES-128,URI="https://keys.example.com/key",IV=0x00000000000000000000000000000001
#EXTINF:10.0,
enc0.ts
#EXTINF:10.0,
enc1.ts
#EXT-X-ENDLIST
`;

const MEDIA_BYTERANGE = `#EXTM3U
#EXT-X-VERSION:4
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
#EXT-X-BYTERANGE:1000@0
video.mp4
#EXTINF:10.0,
#EXT-X-BYTERANGE:1000@1000
video.mp4
#EXT-X-ENDLIST
`;

const MEDIA_DISCONTINUITY = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
seg0.ts
#EXT-X-DISCONTINUITY
#EXTINF:10.0,
seg1.ts
#EXT-X-ENDLIST
`;

const DRM_SAMPLE_AES = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXT-X-KEY:METHOD=SAMPLE-AES,URI="https://drm.example.com/key"
#EXTINF:10.0,
seg0.ts
#EXT-X-ENDLIST
`;

const DRM_KEYFORMAT = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXT-X-KEY:METHOD=AES-128,URI="https://keys.example.com/key",KEYFORMAT="com.apple.streamingkeydelivery"
#EXTINF:10.0,
seg0.ts
#EXT-X-ENDLIST
`;

const BASE = 'https://cdn.example.com/stream/';

describe('parseMaster', () => {
  it('parses basic master playlist', () => {
    const result = parseMaster(MASTER_BASIC, BASE);
    expect(result.variants).toHaveLength(3);
    expect(result.variants[0]!.label).toBe('360p');
    expect(result.variants[0]!.bandwidth).toBe(800000);
    expect(result.variants[0]!.url).toBe('https://cdn.example.com/stream/360p.m3u8');
    expect(result.variants[2]!.resolution).toEqual({ width: 1920, height: 1080 });
    expect(result.variants[2]!.codecs).toBe('avc1.42e028,mp4a.40.2');
  });

  it('throws DrmError on SAMPLE-AES in master', () => {
    const drmMaster = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000
#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key"
360p.m3u8`;
    expect(() => parseMaster(drmMaster, BASE)).toThrow(DrmError);
  });
});

describe('parseMedia', () => {
  it('parses TS media playlist', () => {
    const result = parseMedia(MEDIA_TS, BASE);
    expect(result.segments).toHaveLength(3);
    expect(result.isLive).toBe(false);
    expect(result.targetDuration).toBe(10);
    expect(result.segments[0]!.url).toBe('https://cdn.example.com/stream/seg0.ts');
    expect(result.segments[0]!.duration).toBeCloseTo(9.009);
    expect(result.totalDuration).toBeCloseTo(21.021);
  });

  it('parses fMP4 playlist with EXT-X-MAP', () => {
    const result = parseMedia(MEDIA_FMP4, BASE);
    expect(result.map).toBeDefined();
    expect(result.map!.uri).toBe('https://cdn.example.com/stream/init.mp4');
    expect(result.segments).toHaveLength(2);
  });

  it('parses AES-128 encrypted playlist', () => {
    const result = parseMedia(MEDIA_AES128, BASE);
    expect(result.segments[0]!.key).toBeDefined();
    expect(result.segments[0]!.key!.method).toBe('AES-128');
    expect(result.segments[0]!.key!.uri).toBe('https://keys.example.com/key');
    expect(result.segments[0]!.key!.iv).toBeDefined();
    expect(result.segments[0]!.key!.iv!.length).toBe(16);
    // Last byte should be 1
    expect(result.segments[0]!.key!.iv![15]).toBe(1);
  });

  it('parses byterange playlist', () => {
    const result = parseMedia(MEDIA_BYTERANGE, BASE);
    expect(result.segments[0]!.byterange).toEqual({ offset: 0, length: 1000 });
    expect(result.segments[1]!.byterange).toEqual({ offset: 1000, length: 1000 });
  });

  it('parses discontinuity markers', () => {
    const result = parseMedia(MEDIA_DISCONTINUITY, BASE);
    expect(result.segments[0]!.discontinuity).toBeFalsy();
    expect(result.segments[1]!.discontinuity).toBe(true);
  });

  it('detects live stream (no ENDLIST)', () => {
    const live = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
seg0.ts
`;
    const result = parseMedia(live, BASE);
    expect(result.isLive).toBe(true);
  });

  it('throws DrmError on SAMPLE-AES', () => {
    expect(() => parseMedia(DRM_SAMPLE_AES, BASE)).toThrow(DrmError);
  });

  it('throws DrmError on non-identity KEYFORMAT', () => {
    expect(() => parseMedia(DRM_KEYFORMAT, BASE)).toThrow(DrmError);
  });

  it('inherits query params from base playlist URL for relative keys and segments', () => {
    const playlistWithRelative = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"
#EXTINF:10.0,
seg0.ts
#EXT-X-ENDLIST`;

    const baseWithAuth = 'https://cdn.example.com/hls/stream.m3u8?token=xyz123&expire=9999';
    const result = parseMedia(playlistWithRelative, baseWithAuth);

    expect(result.segments[0]!.key?.uri).toBe(
      'https://cdn.example.com/hls/key.bin?token=xyz123&expire=9999',
    );
    expect(result.segments[0]!.url).toBe(
      'https://cdn.example.com/hls/seg0.ts?token=xyz123&expire=9999',
    );
  });

  it('preserves existing query params on relative keys if already present', () => {
    const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-KEY:METHOD=AES-128,URI="key.php?custom_id=456"
#EXTINF:10.0,
seg0.ts
#EXT-X-ENDLIST`;

    const baseWithAuth = 'https://cdn.example.com/hls/stream.m3u8?token=xyz123';
    const result = parseMedia(playlist, baseWithAuth);

    expect(result.segments[0]!.key?.uri).toBe(
      'https://cdn.example.com/hls/key.php?custom_id=456',
    );
  });
});
