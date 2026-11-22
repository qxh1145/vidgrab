/**
 * T6.3: Realtime video capture using captureStream + MediaRecorder.
 * Fallback mode for blob: URLs or livestream when direct segments are unavailable.
 */

import { assertNoDrm } from './mse-capture';

export interface RealtimeCaptureOptions {
  onChunk: (chunk: Blob) => void;
  onError?: (err: Error) => void;
  timesliceMs?: number;
}

export interface RealtimeCaptureController {
  stop: () => void;
  mimeType: string;
}

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function getBestSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  for (const candidate of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return 'video/webm';
}

export function startRealtimeCapture(
  video: HTMLVideoElement,
  options: RealtimeCaptureOptions,
): RealtimeCaptureController {
  // 1. Verify not DRM protected
  assertNoDrm(video);

  // 2. Obtain stream
  const captureFn =
    (video as unknown as { captureStream?: () => MediaStream }).captureStream ||
    (video as unknown as { mozCaptureStream?: () => MediaStream }).mozCaptureStream;

  if (typeof captureFn !== 'function') {
    throw new Error('Trình duyệt không hỗ trợ captureStream() trên thẻ video.');
  }

  let stream: MediaStream;
  try {
    stream = captureFn.call(video);
  } catch (err) {
    throw new Error(
      `Không thể ghi hình video: Video cross-origin hoặc bị hạn chế bảo mật. (${(err as Error).message})`,
    );
  }

  // 3. Select best MIME type
  const mimeType = getBestSupportedMimeType();

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType });
  } catch (err) {
    try {
      recorder = new MediaRecorder(stream);
    } catch (fallbackErr) {
      throw new Error(`Khởi tạo MediaRecorder thất bại: ${(fallbackErr as Error).message}`);
    }
  }

  const timeslice = options.timesliceMs ?? 1000;

  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data && event.data.size > 0) {
      options.onChunk(event.data);
    }
  };

  recorder.onerror = (event: Event) => {
    const error = (event as unknown as { error?: Error }).error || new Error('MediaRecorder error');
    options.onError?.(error);
  };

  recorder.start(timeslice);

  return {
    stop: () => {
      try {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      } catch {
        // Already stopped
      }
      try {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      } catch {
        // Best effort
      }
    },
    mimeType: recorder.mimeType || mimeType,
  };
}
