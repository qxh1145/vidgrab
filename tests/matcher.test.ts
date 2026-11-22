import { describe, it, expect } from 'vitest';
import { classify } from '../core/detect/matcher';

describe('classify()', () => {
  // HLS
  it('detects HLS by .m3u8 extension', () => {
    const res = classify('https://example.com/live/playlist.m3u8');
    expect(res).toEqual({ kind: 'hls', mime: 'application/vnd.apple.mpegurl' });
  });

  it('detects HLS with query string', () => {
    const res = classify('https://example.com/video.m3u8?token=xyz&expires=123');
    expect(res).toEqual({ kind: 'hls', mime: 'application/vnd.apple.mpegurl' });
  });

  it('detects HLS by content-type application/vnd.apple.mpegurl', () => {
    const res = classify('https://example.com/stream', 'application/vnd.apple.mpegurl');
    expect(res?.kind).toBe('hls');
  });

  it('detects HLS by content-type application/x-mpegurl', () => {
    const res = classify('https://example.com/api/hls', 'application/x-mpegurl');
    expect(res?.kind).toBe('hls');
  });

  it('detects HLS by content-type audio/mpegurl', () => {
    const res = classify('https://example.com/radio', 'audio/mpegurl');
    expect(res?.kind).toBe('hls');
  });

  // DASH
  it('detects DASH by .mpd extension', () => {
    const res = classify('https://example.com/dash/manifest.mpd');
    expect(res).toEqual({ kind: 'dash', mime: 'application/dash+xml' });
  });

  it('detects DASH with query string', () => {
    const res = classify('https://example.com/manifest.mpd?auth=true');
    expect(res).toEqual({ kind: 'dash', mime: 'application/dash+xml' });
  });

  it('detects DASH by content-type application/dash+xml', () => {
    const res = classify('https://example.com/manifest', 'application/dash+xml');
    expect(res?.kind).toBe('dash');
  });

  // Direct files by extension
  it('detects MP4 by extension', () => {
    const res = classify('https://example.com/video.mp4');
    expect(res).toEqual({ kind: 'file', mime: 'video/mp4' });
  });

  it('detects WebM by extension', () => {
    const res = classify('https://example.com/clip.webm');
    expect(res).toEqual({ kind: 'file', mime: 'video/webm' });
  });

  it('detects M4V by extension', () => {
    const res = classify('https://example.com/movie.m4v');
    expect(res).toEqual({ kind: 'file', mime: 'video/x-m4v' });
  });

  it('detects MOV by extension', () => {
    const res = classify('https://example.com/film.mov');
    expect(res).toEqual({ kind: 'file', mime: 'video/quicktime' });
  });

  it('detects M4A by extension', () => {
    const res = classify('https://example.com/track.m4a');
    expect(res).toEqual({ kind: 'file', mime: 'audio/mp4' });
  });

  it('detects MP3 by extension', () => {
    const res = classify('https://example.com/song.mp3');
    expect(res).toEqual({ kind: 'file', mime: 'audio/mpeg' });
  });

  it('detects OGG by extension', () => {
    const res = classify('https://example.com/audio.ogg');
    expect(res).toEqual({ kind: 'file', mime: 'audio/ogg' });
  });

  // Direct files by content-type
  it('detects file by video/mp4 content-type without extension', () => {
    const res = classify('https://example.com/media/12345', 'video/mp4; charset=utf-8');
    expect(res).toEqual({ kind: 'file', mime: 'video/mp4' });
  });

  it('detects file by audio/mpeg content-type', () => {
    const res = classify('https://example.com/stream/audio', 'audio/mpeg');
    expect(res).toEqual({ kind: 'file', mime: 'audio/mpeg' });
  });

  // Exclusions: segments
  it('rejects .ts segment', () => {
    expect(classify('https://example.com/hls/segment001.ts')).toBeNull();
  });

  it('rejects .m4s segment', () => {
    expect(classify('https://example.com/dash/chunk_1.m4s')).toBeNull();
  });

  it('rejects isolated .aac segment', () => {
    expect(classify('https://example.com/hls/audio-10.aac')).toBeNull();
  });

  it('rejects URL with segment number pattern', () => {
    expect(classify('https://example.com/video/segment-123.mp4')).toBeNull();
    expect(classify('https://example.com/video/segment123')).toBeNull();
  });

  it('rejects URL with chunk number pattern', () => {
    expect(classify('https://example.com/video/chunk_5.mp4')).toBeNull();
    expect(classify('https://example.com/video/chunk-001')).toBeNull();
  });

  it('rejects URL with frag number pattern', () => {
    expect(classify('https://example.com/video/frag-12.mp4')).toBeNull();
  });

  // Exclusions: size threshold
  it('rejects file smaller than minSizeKB (default 200KB)', () => {
    const res = classify('https://example.com/preview.mp4', 'video/mp4', 100 * 1024);
    expect(res).toBeNull();
  });

  it('allows file equal to or larger than minSizeKB', () => {
    const res = classify('https://example.com/video.mp4', 'video/mp4', 200 * 1024);
    expect(res).not.toBeNull();
  });

  it('does NOT reject HLS playlist below minSizeKB', () => {
    const res = classify('https://example.com/index.m3u8', undefined, 2048);
    expect(res?.kind).toBe('hls');
  });

  it('respects custom minSizeKB option', () => {
    const res = classify('https://example.com/video.mp4', 'video/mp4', 50 * 1024, {
      minSizeKB: 30,
    });
    expect(res).not.toBeNull();
  });

  // Exclusions: blocked domains
  it('rejects blocked domain youtube.com', () => {
    expect(classify('https://www.youtube.com/watch?v=123.mp4')).toBeNull();
    expect(classify('https://youtube.com/playlist.m3u8')).toBeNull();
    expect(classify('https://youtu.be/test.mp4')).toBeNull();
  });

  it('rejects blocked domain googlevideo.com subdomains', () => {
    expect(classify('https://r1---sn-abc.googlevideo.com/videoplayback.mp4')).toBeNull();
  });

  // Exclusions: Range headers
  it('allows Range starting at 0', () => {
    const res = classify('https://example.com/video.mp4', undefined, undefined, {
      rangeHeader: 'bytes=0-',
    });
    expect(res?.kind).toBe('file');
  });

  it('allows Range starting at 0 with end byte', () => {
    const res = classify('https://example.com/video.mp4', undefined, undefined, {
      rangeHeader: 'bytes=0-1023',
    });
    expect(res?.kind).toBe('file');
  });

  it('rejects Range starting > 0', () => {
    const res = classify('https://example.com/video.mp4', undefined, undefined, {
      rangeHeader: 'bytes=1024-',
    });
    expect(res).toBeNull();
  });

  it('rejects suffix Range (-500)', () => {
    const res = classify('https://example.com/video.mp4', undefined, undefined, {
      rangeHeader: 'bytes=-500',
    });
    expect(res).toBeNull();
  });

  // Non-media
  it('returns null for HTML, JS, image requests', () => {
    expect(classify('https://example.com/index.html', 'text/html')).toBeNull();
    expect(classify('https://example.com/script.js', 'application/javascript')).toBeNull();
    expect(classify('https://example.com/photo.jpg', 'image/jpeg')).toBeNull();
  });
});
