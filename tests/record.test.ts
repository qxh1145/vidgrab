import { describe, it, expect } from 'vitest';
import { isDrmProtected, assertNoDrm, createMseHookScript } from '../core/record/mse-capture';
import { getBestSupportedMimeType } from '../core/record/realtime';
import { DrmError } from '../core/hls/parser';

describe('T6.1 & T6.3: Record Mode (core/record)', () => {
  it('detects DRM when mediaKeys is present', () => {
    const fakeVideoWithoutDrm = { mediaKeys: null } as unknown as HTMLVideoElement;
    expect(isDrmProtected(fakeVideoWithoutDrm)).toBe(false);
    expect(() => assertNoDrm(fakeVideoWithoutDrm)).not.toThrow();

    const fakeVideoWithDrm = { mediaKeys: { keySystem: 'com.widevine.alpha' } } as unknown as HTMLVideoElement;
    expect(isDrmProtected(fakeVideoWithDrm)).toBe(true);
    expect(() => assertNoDrm(fakeVideoWithDrm)).toThrowError(DrmError);
  });

  it('generates MediaSource hook script with appendBuffer interception', () => {
    const script = createMseHookScript();
    expect(script).toContain('MediaSource.prototype.addSourceBuffer');
    expect(script).toContain('sb.appendBuffer');
    expect(script).toContain('vidgrab-mse');
  });

  it('provides a supported video MIME type candidate', () => {
    const mime = getBestSupportedMimeType();
    expect(mime).toMatch(/^video\/(mp4|webm)/);
  });
});
