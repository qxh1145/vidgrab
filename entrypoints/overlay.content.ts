import { startRealtimeCapture } from '@/core/record/realtime';
import { isDrmProtected } from '@/core/record/mse-capture';
import { sendMsg } from '@/shared/messages';
import { t } from '@/shared/i18n';

// ISOLATED world: bridge postMessage from MAIN world + video recording overlay
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  allFrames: true,
  main() {
    let activeRealtimeStop: (() => void) | null = null;
    let currentRecordingTaskId = '';

    // 1. Bridge messages from MAIN world
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data) return;
      const data = event.data;

      // Playlist sniffing bridge
      if (data.source === 'vidgrab' && data.type === 'PLAYLIST_FOUND') {
        browser.runtime
          .sendMessage({
            type: 'PLAYLIST_FOUND_FROM_CONTENT',
            url: data.url as string,
            kind: data.kind as string,
          })
          .catch(() => {});
      }

      // MSE Chunk relay
      if ((data.source === 'vidgrab' || data.source === 'vidgrab-mse') && data.type === 'MSE_CHUNK') {
        browser.runtime
          .sendMessage({
            type: 'MSE_CHUNK_RECEIVED',
            taskId: data.taskId as string,
            track: data.track as string,
            data: Array.from(new Uint8Array(data.data as ArrayBuffer)),
          })
          .catch(() => {});
      }
    });

    // Listen for stop recording command from record tab
    browser.runtime.onMessage.addListener((msg: unknown) => {
      if (typeof msg === 'object' && msg !== null && (msg as { type: string }).type === 'STOP_RECORDING') {
        const { taskId } = msg as { taskId: string };
        if (taskId === currentRecordingTaskId) {
          // Stop MSE
          window.postMessage({ source: 'vidgrab-control', type: 'STOP_MSE_RECORD' }, '*');
          // Stop Realtime if running
          if (activeRealtimeStop) {
            activeRealtimeStop();
            activeRealtimeStop = null;
          }
          currentRecordingTaskId = '';
        }
      }
    });

    // 2. Video Overlay Detection (T6.4)
    const attachedVideos = new WeakSet<HTMLVideoElement>();

    function checkVideo(video: HTMLVideoElement) {
      if (attachedVideos.has(video)) return;

      const src = video.currentSrc || video.src || '';
      const isBlob = src.startsWith('blob:');

      // Check if video is loaded and visible
      if (isBlob || video.readyState >= 1) {
        attachOverlay(video);
      } else {
        const onLoaded = () => {
          video.removeEventListener('loadedmetadata', onLoaded);
          attachOverlay(video);
        };
        video.addEventListener('loadedmetadata', onLoaded, { once: true });
      }
    }

    function attachOverlay(video: HTMLVideoElement) {
      if (attachedVideos.has(video)) return;
      attachedVideos.add(video);

      const host = document.createElement('div');
      host.className = 'vidgrab-video-overlay-host';
      host.style.position = 'absolute';
      host.style.zIndex = '2147483640';
      host.style.pointerEvents = 'none';

      const shadow = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = `
        .badge {
          pointer-events: auto;
          position: absolute;
          top: 10px;
          right: 10px;
          background: rgba(17, 24, 39, 0.85);
          backdrop-filter: blur(4px);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          padding: 4px 8px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 11px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 5px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          opacity: 0.85;
        }
        .badge:hover {
          opacity: 1;
          background: rgba(99, 102, 241, 0.95);
          transform: translateY(-1px);
        }
        .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #ef4444;
          box-shadow: 0 0 6px #ef4444;
          animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `;

      const badge = document.createElement('button');
      badge.className = 'badge';
      badge.innerHTML = `<span class="dot"></span><span>${t('record_overlay_btn')}</span>`;

      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // DRM Check per GEMINI.md §2
        if (isDrmProtected(video)) {
          alert(t('err_drm_protected'));
          return;
        }

        const taskId = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        currentRecordingTaskId = taskId;

        const isBlob = (video.currentSrc || video.src || '').startsWith('blob:');
        const mode = isBlob ? 'mse' : 'realtime';

        // Open record tab
        sendMsg({
          type: 'OPEN_RECORD_TAB',
          taskId,
          mode,
          title: document.title,
        }).catch(() => {});

        if (mode === 'mse') {
          // Tell MAIN world to begin capturing appendBuffer chunks
          window.postMessage(
            {
              source: 'vidgrab-control',
              type: 'START_MSE_RECORD',
              taskId,
            },
            '*',
          );
        } else {
          // Start realtime recording
          try {
            const controller = startRealtimeCapture(video, {
              onChunk: async (blob) => {
                const arrayBuf = await blob.arrayBuffer();
                browser.runtime
                  .sendMessage({
                    type: 'REALTIME_CHUNK_RECEIVED',
                    taskId,
                    data: Array.from(new Uint8Array(arrayBuf)),
                  })
                  .catch(() => {});
              },
              onError: (err) => {
                alert(`Lỗi ghi video thời gian thực: ${err.message}`);
              },
            });
            activeRealtimeStop = controller.stop;
          } catch (err) {
            alert((err as Error).message);
          }
        }
      });

      shadow.appendChild(style);
      shadow.appendChild(badge);

      function positionOverlay() {
        if (!video.isConnected) {
          host.remove();
          return;
        }
        const rect = video.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        host.style.top = `${rect.top + window.scrollY}px`;
        host.style.left = `${rect.left + window.scrollX}px`;
        host.style.width = `${rect.width}px`;
        host.style.height = `${rect.height}px`;
      }

      positionOverlay();
      document.body.appendChild(host);

      window.addEventListener('resize', positionOverlay, { passive: true });
      window.addEventListener('scroll', positionOverlay, { passive: true });
    }

    // Scan initial videos
    document.querySelectorAll('video').forEach((v) => checkVideo(v));

    // Observe dynamic videos
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLVideoElement) {
            checkVideo(node);
          } else if (node instanceof HTMLElement) {
            node.querySelectorAll('video').forEach((v) => checkVideo(v));
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  },
});
