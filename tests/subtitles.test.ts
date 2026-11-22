import { describe, it, expect } from 'vitest';
import { mergeVttSegments } from '../core/hls/subtitles';

describe('T7.2: VTT Subtitles Merger (core/hls/subtitles.ts)', () => {
  it('merges multiple WebVTT segment chunks into a unified VTT file', () => {
    const chunk1 = `WEBVTT
X-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000

00:00:01.000 --> 00:00:04.000
Xin chào các bạn`;

    const chunk2 = `WEBVTT
X-TIMESTAMP-MAP=MPEGTS:1260000,LOCAL:00:00:04.000

00:00:04.500 --> 00:00:08.000
Chào mừng đến với VidGrab`;

    const merged = mergeVttSegments([chunk1, chunk2]);

    expect(merged).toContain('WEBVTT');
    // Only one WEBVTT header
    const webvttMatches = merged.match(/WEBVTT/g);
    expect(webvttMatches?.length).toBe(1);

    // Stripped X-TIMESTAMP-MAP
    expect(merged).not.toContain('X-TIMESTAMP-MAP');

    // Retained cues
    expect(merged).toContain('00:00:01.000 --> 00:00:04.000');
    expect(merged).toContain('Xin chào các bạn');
    expect(merged).toContain('00:00:04.500 --> 00:00:08.000');
    expect(merged).toContain('Chào mừng đến với VidGrab');
  });

  it('handles empty segment list', () => {
    const empty = mergeVttSegments([]);
    expect(empty).toBe('WEBVTT\n\n');
  });
});
