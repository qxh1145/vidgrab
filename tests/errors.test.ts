import { describe, it, expect } from 'vitest';
import { classifyError, getErrorMessage } from '../shared/errors';
import { DrmError } from '../core/hls/parser';

describe('errors classification module', () => {
  it('classifies DrmError as DRM_PROTECTED', () => {
    const err = new DrmError('Protected with Sample-AES');
    const result = classifyError(err);
    expect(result.code).toBe('DRM_PROTECTED');
    expect(result.messageKey).toBe('err_drm_protected');
  });

  it('classifies YouTube domains as YOUTUBE_BLOCKED', () => {
    const result = classifyError(new Error('Blocked request to https://www.youtube.com/watch?v=123'));
    expect(result.code).toBe('YOUTUBE_BLOCKED');
    expect(result.messageKey).toBe('err_youtube_blocked');
  });

  it('classifies HTTP 403 Forbidden', () => {
    const result = classifyError(new Error('Fetch failed with status 403'));
    expect(result.code).toBe('HTTP_403');
    expect(result.messageKey).toBe('err_network_403');
  });

  it('classifies HTTP 404 Not Found', () => {
    const result = classifyError(new Error('HTTP 404 Not Found'));
    expect(result.code).toBe('HTTP_404');
    expect(result.messageKey).toBe('err_network_404');
  });

  it('classifies quota and disk space errors', () => {
    const result = classifyError(new Error('QuotaExceededError: storage full'));
    expect(result.code).toBe('STORAGE_FULL');
    expect(result.messageKey).toBe('err_disk_full');
  });

  it('classifies CORS tainted errors', () => {
    const result = classifyError(new Error('SecurityError: The operation is insecure because cross-origin canvas is tainted'));
    expect(result.code).toBe('CORS_TAINTED');
    expect(result.messageKey).toBe('err_cors_tainted');
  });

  it('classifies network timeouts', () => {
    const result = classifyError(new Error('Request timed out'));
    expect(result.code).toBe('NETWORK_TIMEOUT');
    expect(result.messageKey).toBe('err_network_timeout');
  });

  it('classifies unknown errors gracefully', () => {
    const result = classifyError(new Error('Something unusual happened'));
    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('Something unusual happened');
  });

  it('returns localized error messages', () => {
    expect(getErrorMessage('DRM_PROTECTED', 'vi')).toContain('DRM');
    expect(getErrorMessage('DRM_PROTECTED', 'en')).toContain('DRM');
    expect(getErrorMessage('YOUTUBE_BLOCKED', 'vi')).toContain('YouTube');
    expect(getErrorMessage('YOUTUBE_BLOCKED', 'en')).toContain('YouTube');
  });
});
