/**
 * T6.1: MediaSource buffer capture logic and DRM verification.
 */

import { DrmError } from '../hls/parser';

export interface MseChunkInfo {
  track: 'video' | 'audio' | 'muxed';
  data: ArrayBuffer;
  timestamp: number;
}

/**
 * Check if a video element is DRM protected.
 * Per GEMINI.md §2: Widewine, FairPlay, PlayReady DRM streams must not be captured.
 */
export function isDrmProtected(video: HTMLVideoElement): boolean {
  if (video.mediaKeys !== null && video.mediaKeys !== undefined) {
    return true;
  }
  return false;
}

export function assertNoDrm(video: HTMLVideoElement): void {
  if (isDrmProtected(video)) {
    throw new DrmError('Video được bảo vệ bằng DRM (EME / MediaKeys), không hỗ trợ ghi.');
  }
}

/**
 * Generates script to inject into MAIN world to intercept MediaSource buffers.
 */
export function createMseHookScript(): string {
  return `
    (function() {
      if (window.__vidgrab_mse_hooked__) return;
      window.__vidgrab_mse_hooked__ = true;

      let isRecording = false;
      let activeSessionId = '';

      window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data || event.data.source !== 'vidgrab-control') return;
        if (event.data.type === 'START_MSE_RECORD') {
          isRecording = true;
          activeSessionId = event.data.sessionId || '';
        } else if (event.data.type === 'STOP_MSE_RECORD') {
          isRecording = false;
          activeSessionId = '';
        }
      });

      const origAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
      MediaSource.prototype.addSourceBuffer = function(mimeType) {
        const sb = origAddSourceBuffer.call(this, mimeType);
        const track = mimeType.includes('audio') ? 'audio' : mimeType.includes('video') ? 'video' : 'muxed';

        const origAppend = sb.appendBuffer;
        sb.appendBuffer = function(data) {
          if (isRecording && data) {
            try {
              let copy;
              if (data instanceof ArrayBuffer) {
                copy = data.slice(0);
              } else if (ArrayBuffer.isView(data)) {
                copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
              }
              if (copy && copy.byteLength > 0) {
                window.postMessage(
                  {
                    source: 'vidgrab-mse',
                    type: 'MSE_CHUNK',
                    sessionId: activeSessionId,
                    track,
                    data: copy,
                    timestamp: Date.now(),
                  },
                  '*',
                  [copy]
                );
              }
            } catch (e) {
              // Best effort
            }
          }
          return origAppend.call(this, data);
        };
        return sb;
      };
    })();
  `;
}
