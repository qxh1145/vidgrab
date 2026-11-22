import { describe, it, expect } from 'vitest';
import { parseMpd, checkDashDrm } from '../core/dash/parser';
import { DrmError } from '../core/hls/parser';

describe('T5.1: DASH MPD Parser (core/dash/parser.ts)', () => {
  // Sample 1: SegmentTemplate with $Number$
  const mpdNumberTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT30S">
  <Period id="0">
    <AdaptationSet contentType="video" mimeType="video/mp4" width="1280" height="720">
      <Representation id="v720p" bandwidth="2000000" codecs="avc1.4d401f">
        <SegmentTemplate initialization="video_init.mp4" media="video_$Number$.m4s" startNumber="1">
          <SegmentTimeline>
            <S t="0" d="2000" r="2" />
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
    <AdaptationSet contentType="audio" mimeType="audio/mp4">
      <Representation id="a128k" bandwidth="128000" codecs="mp4a.40.2">
        <SegmentTemplate initialization="audio_init.mp4" media="audio_$Number$.m4s" startNumber="1">
          <SegmentTimeline>
            <S t="0" d="2000" r="2" />
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

  // Sample 2: SegmentTemplate with $Time$
  const mpdTimeTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT60S">
  <Period id="0">
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <Representation id="v1080p" bandwidth="4500000" width="1920" height="1080" codecs="avc1.640028">
        <SegmentTemplate initialization="init-$RepresentationID$.mp4" media="chunk-$RepresentationID$-$Time$.m4s" timescale="1000">
          <SegmentTimeline>
            <S t="0" d="2000" />
            <S t="2000" d="2000" />
            <S t="4000" d="2000" />
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

  // Sample 3: SegmentList format
  const mpdSegmentList = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT10S">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v360p" bandwidth="800000" width="640" height="360">
        <SegmentList duration="5">
          <Initialization sourceURL="init_360.mp4"/>
          <SegmentURL media="segment_1.mp4"/>
          <SegmentURL media="segment_2.mp4"/>
        </SegmentList>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

  // Sample 4: DRM Widevine ContentProtection
  const mpdWithWidevineDrm = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT60S">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed">
        <cenc:pssh>AAAAPnBzc2gAAAAA7e+LqXnWSs632FsDA90h7QAAAA4IARIEDaHqX6W3R4m...==</cenc:pssh>
      </ContentProtection>
      <Representation id="drm-v1" bandwidth="1500000" width="1280" height="720">
        <SegmentTemplate initialization="init.mp4" media="seg-$Number$.m4s" startNumber="1">
          <SegmentTimeline><S d="1000" r="1"/></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

  // Sample 5: DRM PlayReady ContentProtection
  const mpdWithPlayReadyDrm = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <ContentProtection schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95" />
      <Representation id="pr-v1" bandwidth="2000000" />
    </AdaptationSet>
  </Period>
</MPD>`;

  it('1. parses SegmentTemplate with $Number$ and resolves absolute URLs for video and audio', () => {
    const result = parseMpd(mpdNumberTemplate, 'https://cdn.example.com/dash/manifest.mpd');

    expect(result.duration).toBe(30);
    expect(result.videoTracks).toHaveLength(1);
    const video = result.videoTracks[0]!;
    expect(video.label).toBe('720p');
    expect(video.resolution).toEqual({ width: 1280, height: 720 });
    expect(video.initUrl).toBe('https://cdn.example.com/dash/video_init.mp4');
    expect(video.segments.length).toBeGreaterThan(0);
    expect(video.segments[0]!.url).toBe('https://cdn.example.com/dash/video_1.m4s');

    expect(result.audioTracks).toHaveLength(1);
    const audio = result.audioTracks[0]!;
    expect(audio.initUrl).toBe('https://cdn.example.com/dash/audio_init.mp4');
    expect(audio.segments[0]!.url).toBe('https://cdn.example.com/dash/audio_1.m4s');
  });

  it('2. parses SegmentTemplate with $Time$ and resolves segments correctly', () => {
    const result = parseMpd(mpdTimeTemplate, 'https://cdn.example.com/media/manifest.mpd');

    expect(result.duration).toBe(60);
    expect(result.videoTracks).toHaveLength(1);
    const video = result.videoTracks[0]!;
    expect(video.label).toBe('1080p');
    expect(video.resolution).toEqual({ width: 1920, height: 1080 });
    expect(video.segments.length).toBe(3);
    expect(video.segments[0]!.url).toContain('chunk-v1080p-0.m4s');
  });

  it('3. parses SegmentList and extracts segment URLs and init URL', () => {
    const result = parseMpd(mpdSegmentList, 'https://video.org/vod/stream.mpd');

    expect(result.duration).toBe(10);
    expect(result.videoTracks).toHaveLength(1);
    const video = result.videoTracks[0]!;
    expect(video.label).toBe('360p');
    expect(video.initUrl).toBe('https://video.org/vod/init_360.mp4');
    expect(video.segments).toHaveLength(2);
    expect(video.segments[0]!.url).toBe('https://video.org/vod/segment_1.mp4');
    expect(video.segments[1]!.url).toBe('https://video.org/vod/segment_2.mp4');
  });

  it('4. detects Widevine ContentProtection and throws DrmError per GEMINI.md §2', () => {
    expect(() => {
      parseMpd(mpdWithWidevineDrm, 'https://example.com/manifest.mpd');
    }).toThrowError(DrmError);

    expect(() => {
      checkDashDrm(mpdWithWidevineDrm);
    }).toThrowError(/DRM/i);
  });

  it('5. detects PlayReady ContentProtection and throws DrmError', () => {
    expect(() => {
      parseMpd(mpdWithPlayReadyDrm, 'https://example.com/manifest.mpd');
    }).toThrowError(DrmError);
  });
});
