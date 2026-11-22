import { describe, it, expect } from 'vitest';
import { buildFilename, sanitize, cleanVideoTitle, extractNameFromUrl } from '../shared/filename';
import type { DetectedMedia } from '../shared/types';

function makeMedia(overrides: Partial<DetectedMedia> = {}): DetectedMedia {
  return {
    id: 'test-1',
    tabId: 1,
    url: 'https://example.com/video.mp4',
    kind: 'file',
    mime: 'video/mp4',
    requestHeaders: {},
    pageUrl: 'https://example.com',
    pageTitle: 'Test Video',
    domain: 'example.com',
    detectedAt: Date.now(),
    ...overrides,
  };
}

describe('sanitize', () => {
  it('replaces forbidden characters', () => {
    expect(sanitize('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });

  it('trims and collapses whitespace', () => {
    expect(sanitize('  hello   world  ')).toBe('hello world');
  });

  it('removes trailing dots', () => {
    expect(sanitize('name...')).toBe('name');
  });

  it('enforces max length', () => {
    const long = 'a'.repeat(200);
    expect(sanitize(long).length).toBeLessThanOrEqual(150);
  });

  it('returns "video" for empty input', () => {
    expect(sanitize('')).toBe('video');
  });

  it('returns "video" for only forbidden chars', () => {
    expect(sanitize('***???')).toBe('video');
  });
});

describe('buildFilename', () => {
  it('replaces {title} and {quality}', () => {
    const media = makeMedia({
      pageTitle: 'My Video',
      variants: [{ url: '', bandwidth: 5000000, resolution: { width: 1920, height: 1080 }, label: '1080p' }],
    });
    const name = buildFilename('{title}_{quality}', media);
    expect(name).toBe('My Video_1080p.mp4');
  });

  it('uses correct extension from URL', () => {
    const media = makeMedia({ url: 'https://example.com/clip.webm' });
    expect(buildFilename('{title}', media)).toBe('Test Video.webm');
  });

  it('uses extension from mime when URL has no ext', () => {
    const media = makeMedia({ url: 'https://example.com/stream', mime: 'video/webm' });
    expect(buildFilename('{title}', media)).toBe('Test Video.webm');
  });

  it('defaults to mp4 when no ext info', () => {
    const media = makeMedia({ url: 'https://example.com/stream', mime: undefined });
    expect(buildFilename('{title}', media)).toBe('Test Video.mp4');
  });

  it('replaces {domain}', () => {
    const media = makeMedia({ domain: 'cdn.example.com' });
    expect(buildFilename('{domain}_{title}', media)).toBe('cdn.example.com_Test Video.mp4');
  });

  it('replaces {date} with YYYY-MM-DD', () => {
    const media = makeMedia();
    const name = buildFilename('{date}', media);
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}\.mp4$/);
  });

  it('sanitizes forbidden chars from title', () => {
    const media = makeMedia({ pageTitle: 'My: "Best" <Video>' });
    const name = buildFilename('{title}', media);
    expect(name).toBe('My_ _Best_ _Video.mp4');
  });

  it('uses URL filename when no pageTitle', () => {
    const media = makeMedia({ pageTitle: '', url: 'https://example.com/cool-clip.mp4' });
    const name = buildFilename('{title}', media);
    expect(name).toBe('cool-clip.mp4');
  });

  it('allows explicit ext override', () => {
    const media = makeMedia();
    expect(buildFilename('{title}', media, 'm4a')).toBe('Test Video.m4a');
  });

  it('handles empty quality gracefully by removing separator', () => {
    const media = makeMedia(); // no variants
    expect(buildFilename('{title}_{quality}', media)).toBe('Test Video.mp4');
  });

  it('escapes Windows reserved device names', () => {
    expect(sanitize('con')).toBe('con_file');
    expect(sanitize('PRN')).toBe('PRN_file');
    expect(sanitize('aux')).toBe('aux_file');
    expect(sanitize('nul')).toBe('nul_file');
  });

  it('cleans website branding suffixes from page title', () => {
    expect(cleanVideoTitle('Big Buck Bunny 4K - YouTube')).toBe('Big Buck Bunny 4K');
    expect(cleanVideoTitle('Spider-Man No Way Home | Netflix')).toBe('Spider-Man No Way Home');
    expect(cleanVideoTitle('Tập 1: Khởi Đầu - HayTV - Xem Phim Online')).toBe('Tập 1: Khởi Đầu');
    expect(cleanVideoTitle('Direct Title')).toBe('Direct Title');
  });

  it('extractNameFromUrl skips generic manifest names (master, index, stream)', () => {
    expect(extractNameFromUrl('https://cdn.example.com/hls/spider_man/master.m3u8')).toBe('spider_man');
    expect(extractNameFromUrl('https://cdn.example.com/videos/anime_ep1/index.m3u8')).toBe('anime_ep1');
    expect(extractNameFromUrl('https://cdn.example.com/hls/stream.m3u8?title=My%20Awesome%20Video')).toBe('My Awesome Video');
  });
});
