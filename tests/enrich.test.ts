import { describe, it, expect, vi } from 'vitest';
import { enrich } from '../core/detect/enrich';
import type { DetectedMedia } from '../shared/types';

function createMockMedia(overrides: Partial<DetectedMedia> = {}): DetectedMedia {
  return {
    id: 'test-1',
    tabId: 1,
    url: 'https://example.com/video.mp4',
    kind: 'file',
    requestHeaders: {
      Referer: 'https://example.com/page',
      Origin: 'https://example.com',
    },
    pageUrl: 'https://example.com/page',
    pageTitle: 'Example Video',
    domain: 'example.com',
    detectedAt: Date.now(),
    ...overrides,
  };
}

describe('T1.6: Metadata Enrichment (core/detect/enrich.ts)', () => {
  describe('File enrichment', () => {
    it('populates size from HEAD response content-length', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        headers: new Headers({ 'content-length': '52428800' }), // 50MB
      } as unknown as Response);

      const media = createMockMedia({ kind: 'file', url: 'https://example.com/movie.mp4' });
      const enriched = await enrich(media, mockFetch as unknown as typeof fetch);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/movie.mp4',
        expect.objectContaining({
          method: 'HEAD',
          headers: expect.objectContaining({
            Referer: 'https://example.com/page',
            Origin: 'https://example.com',
          }),
        }),
      );
      expect(enriched.size).toBe(52428800);
    });

    it('falls back to GET Range: bytes=0-0 when HEAD has no content-length', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          headers: new Headers(), // HEAD has no content-length
        } as unknown as Response)
        .mockResolvedValueOnce({
          headers: new Headers({ 'content-range': 'bytes 0-0/10485760' }), // 10MB
        } as unknown as Response);

      const media = createMockMedia({ kind: 'file', url: 'https://example.com/clip.webm' });
      const enriched = await enrich(media, mockFetch as unknown as typeof fetch);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/clip.webm',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Range: 'bytes=0-0' }),
        }),
      );
      expect(enriched.size).toBe(10485760);
    });

    it('skips fetch if size is already known', async () => {
      const mockFetch = vi.fn();
      const media = createMockMedia({ kind: 'file', size: 1024 });
      const enriched = await enrich(media, mockFetch as unknown as typeof fetch);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(enriched.size).toBe(1024);
    });
  });

  describe('HLS enrichment', () => {
    it('enriches HLS master playlist with variants and fetches first variant to calculate duration and size (Apple test format)', async () => {
      const masterM3u8 = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"
gear1/prog_index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=960x540,CODECS="avc1.4d401f,mp4a.40.2"
gear2/prog_index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
gear3/prog_index.m3u8`;

      const variantMediaM3u8 = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment1.ts
#EXTINF:10.0,
segment2.ts
#EXTINF:5.5,
segment3.ts
#EXT-X-ENDLIST`;

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          text: async () => masterM3u8,
        } as unknown as Response)
        .mockResolvedValueOnce({
          text: async () => variantMediaM3u8,
        } as unknown as Response);

      const media = createMockMedia({
        kind: 'hls',
        url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
      });

      const enriched = await enrich(media, mockFetch as unknown as typeof fetch);

      expect(enriched.variants).toHaveLength(3);
      expect(enriched.variants?.[0]).toEqual({
        url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/gear1/prog_index.m3u8',
        bandwidth: 800000,
        resolution: { width: 640, height: 360 },
        codecs: 'avc1.4d401e,mp4a.40.2',
        label: '360p',
      });
      expect(enriched.variants?.[2]?.label).toBe('720p');

      // Duration: 10 + 10 + 5.5 = 25.5s
      expect(enriched.duration).toBe(25.5);
      // Size estimate: (800000 * 25.5) / 8 = 2,550,000 bytes
      expect(enriched.size).toBe(2550000);
    });

    it('enriches HLS media playlist with duration directly from EXTINF', async () => {
      const mediaM3u8 = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
seg0.ts
#EXTINF:6.0,
seg1.ts
#EXTINF:4.2,
seg2.ts
#EXT-X-ENDLIST`;

      const mockFetch = vi.fn().mockResolvedValueOnce({
        text: async () => mediaM3u8,
      } as unknown as Response);

      const media = createMockMedia({
        kind: 'hls',
        url: 'https://example.com/stream/index.m3u8',
      });

      const enriched = await enrich(media, mockFetch as unknown as typeof fetch);

      expect(enriched.duration).toBe(16.2);
    });
  });

  describe('DASH enrichment', () => {
    it('parses mediaPresentationDuration and representations', async () => {
      const mpdText = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT1H2M30.5S">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v1" bandwidth="1500000" width="1280" height="720" codecs="avc1.4d401f" />
      <Representation id="v2" bandwidth="3000000" width="1920" height="1080" codecs="avc1.640028" />
    </AdaptationSet>
  </Period>
</MPD>`;

      const mockFetch = vi.fn().mockResolvedValueOnce({
        text: async () => mpdText,
      } as unknown as Response);

      const media = createMockMedia({
        kind: 'dash',
        url: 'https://example.com/manifest.mpd',
      });

      const enriched = await enrich(media, mockFetch as unknown as typeof fetch);

      // Duration: 1 hour (3600) + 2 min (120) + 30.5 sec = 3750.5s
      expect(enriched.duration).toBe(3750.5);
      expect(enriched.variants).toHaveLength(2);
      expect(enriched.variants?.[0]?.label).toBe('720p');
      expect(enriched.variants?.[1]?.label).toBe('1080p');
      expect(enriched.variants?.[1]?.bandwidth).toBe(3000000);
      expect(enriched.size).toBe(Math.round((1500000 * 3750.5) / 8));
    });
  });
});
