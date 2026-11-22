// MAIN world: hook fetch/XHR to detect playlists without standard extensions
export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN',
  runAt: 'document_start',
  allFrames: true,
  main() {
    const SOURCE = 'vidgrab';
    const MAX_PEEK = 2 * 1024 * 1024; // 2 MB

    function detectKind(text: string): 'hls' | 'dash' | null {
      const trimmed = text.trimStart();
      if (trimmed.startsWith('#EXTM3U')) return 'hls';
      if (trimmed.includes('<MPD')) return 'dash';
      return null;
    }

    function notify(url: string, kind: 'hls' | 'dash') {
      window.postMessage({ source: SOURCE, type: 'PLAYLIST_FOUND', url, kind }, '*');
    }

    // --- Hook fetch ---
    const origFetch = window.fetch;
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const response = await origFetch.apply(this, args);
      try {
        const cl = response.headers.get('content-length');
        if (cl && parseInt(cl, 10) > MAX_PEEK) return response;

        const cloned = response.clone();
        // Read in background — don't block caller
        cloned.text().then((text) => {
          if (text.length > MAX_PEEK) return;
          const kind = detectKind(text);
          if (kind) {
            const url =
              typeof args[0] === 'string'
                ? args[0]
                : args[0] instanceof Request
                  ? args[0].url
                  : String(args[0]);
            notify(url, kind);
          }
        }).catch(() => { /* ignore */ });
      } catch {
        // Don't break site
      }
      return response;
    };

    // --- Hook XMLHttpRequest ---
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    const xhrUrlMap = new WeakMap<XMLHttpRequest, string>();

    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      xhrUrlMap.set(this, String(url));
      // @ts-expect-error rest spread for overloaded method
      return origOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args: unknown[]) {
      this.addEventListener('load', function () {
        try {
          if (typeof this.responseText !== 'string') return;
          if (this.responseText.length > MAX_PEEK) return;
          const kind = detectKind(this.responseText);
          if (kind) {
            const url = xhrUrlMap.get(this) ?? this.responseURL;
            notify(url, kind);
          }
        } catch {
          // ignore
        }
      });
      // @ts-expect-error rest spread for overloaded method
      return origSend.apply(this, args);
    };

    // --- Hook MediaSource and SourceBuffer for MSE Capture (T6.1) ---
    let isRecordingMse = false;
    let activeMseTaskId = '';

    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.source !== 'vidgrab-control') return;
      if (event.data.type === 'START_MSE_RECORD') {
        isRecordingMse = true;
        activeMseTaskId = event.data.taskId || '';
      } else if (event.data.type === 'STOP_MSE_RECORD') {
        isRecordingMse = false;
        activeMseTaskId = '';
      }
    });

    if (typeof MediaSource !== 'undefined') {
      const origAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
      MediaSource.prototype.addSourceBuffer = function (mimeType: string) {
        const sb = origAddSourceBuffer.call(this, mimeType);
        const track = mimeType.includes('audio') ? 'audio' : mimeType.includes('video') ? 'video' : 'muxed';

        const origAppend = sb.appendBuffer;
        sb.appendBuffer = function (data: BufferSource) {
          if (isRecordingMse && data) {
            try {
              let copy: ArrayBuffer | null = null;
              if (data instanceof ArrayBuffer) {
                copy = data.slice(0);
              } else if (ArrayBuffer.isView(data)) {
                copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
              }
              if (copy && copy.byteLength > 0) {
                window.postMessage(
                  {
                    source: SOURCE,
                    type: 'MSE_CHUNK',
                    taskId: activeMseTaskId,
                    track,
                    data: copy,
                  },
                  '*',
                  [copy],
                );
              }
            } catch {
              // Best effort
            }
          }
          return origAppend.call(this, data);
        };
        return sb;
      };
    }
  },
});
