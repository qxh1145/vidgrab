import { classify } from '@/core/detect/matcher';
import {
  addMedia,
  clearTab,
  getMediaForTab,
  getCount,
  updateMediaTitle,
  updateMediaItem,
} from '@/core/detect/media-store';
import { onMsg } from '@/shared/messages';
import { getSettings } from '@/shared/settings';
import { log } from '@/shared/logger';
import { buildFilename } from '@/shared/filename';
import { applyHeaders, removeHeaders } from '@/core/net/header-rules';
import { listTaskDirs, removeTaskDir } from '@/core/storage/opfs';
import type { DetectedMedia, DownloadTask } from '@/shared/types';

export default defineBackground(() => {
  log.info('VidGrab background started', { id: browser.runtime.id });

  // --- T3.8: Clean up orphaned OPFS directories (> 7 days old) ---
  void cleanupOrphanedOpfs();

  async function cleanupOrphanedOpfs(): Promise<void> {
    try {
      const dirs = await listTaskDirs();
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const dirName of dirs) {
        const match = dirName.match(/task-(\d+)/);
        if (match && match[1]) {
          const ts = parseInt(match[1], 10);
          if (ts < cutoff) {
            await removeTaskDir(dirName);
            log.info('Purged orphaned OPFS directory', dirName);
          }
        }
      }
    } catch (err) {
      log.warn('Failed to cleanup orphaned OPFS dirs', err);
    }
  }

  // --- Temp header cache per requestId (cleanup after 60s) ---
  const headerCache = new Map<
    string,
    { referer?: string; origin?: string; ua?: string; ts: number }
  >();

  // Purge stale entries every 30s
  setInterval(() => {
    const cutoff = Date.now() - 60_000;
    for (const [id, entry] of headerCache) {
      if (entry.ts < cutoff) headerCache.delete(id);
    }
  }, 30_000);

  // --- webRequest.onSendHeaders: capture request headers ---
  browser.webRequest.onSendHeaders.addListener(
    (details) => {
      const headers: Record<string, string> = {};
      for (const h of details.requestHeaders ?? []) {
        const name = h.name.toLowerCase();
        if (name === 'referer') headers.referer = h.value ?? '';
        else if (name === 'origin') headers.origin = h.value ?? '';
        else if (name === 'user-agent') headers.ua = h.value ?? '';
      }
      if (Object.keys(headers).length > 0) {
        headerCache.set(details.requestId, { ...headers, ts: Date.now() });
      }
    },
    { urls: ['<all_urls>'] },
    ['requestHeaders', 'extraHeaders'],
  );

  // --- webRequest.onHeadersReceived: classify & store ---
  browser.webRequest.onHeadersReceived.addListener(
    (details) => {
      void handleHeadersReceived(details);
      return undefined;
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders'],
  );

  async function handleHeadersReceived(
    details: Browser.webRequest.OnHeadersReceivedDetails,
  ): Promise<void> {
      // Skip non-tab requests
      if (details.tabId < 0) return;

      // Extract response info
      let contentType = '';
      let contentLength: number | undefined;
      for (const h of details.responseHeaders ?? []) {
        const name = h.name.toLowerCase();
        if (name === 'content-type') contentType = h.value ?? '';
        else if (name === 'content-length') {
          contentLength = parseInt(h.value ?? '0', 10) || undefined;
        }
      }

      // Get current settings for minSizeKB
      const settings = await getSettings();

      const result = classify(details.url, contentType, contentLength, {
        minSizeKB: settings.minSizeKB,
      });
      if (!result) return;

      // Build DetectedMedia
      const cached = headerCache.get(details.requestId);
      const requestHeaders: Record<string, string> = {};
      if (cached?.referer) requestHeaders['Referer'] = cached.referer;
      if (cached?.origin) requestHeaders['Origin'] = cached.origin;
      if (cached?.ua) requestHeaders['User-Agent'] = cached.ua;

      let pageUrl = '';
      let pageTitle = '';
      try {
        const tab = await browser.tabs.get(details.tabId);
        pageUrl = tab.url ?? '';
        pageTitle = tab.title ?? '';
      } catch {
        // Tab may have been closed
      }

      const domain = (() => {
        try {
          return new URL(details.url).hostname;
        } catch {
          return '';
        }
      })();

      const item: DetectedMedia = {
        id: `${details.tabId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tabId: details.tabId,
        url: details.url,
        kind: result.kind,
        mime: result.mime,
        size: contentLength,
        requestHeaders,
        pageUrl,
        pageTitle,
        domain,
        detectedAt: Date.now(),
      };

      const items = await addMedia(item);
      log.debug('Media detected', item.kind, item.url);

      // Asynchronously fetch best title from page DOM (og:title, h1, etc.)
      void getBestTitleForTab(details.tabId).then(async (best) => {
        if (best && best.trim().length > 0 && best !== pageTitle) {
          item.pageTitle = best;
          await updateMediaTitle(details.tabId, item.id, best);
        }
      });

      // Update badge
      await updateBadge(details.tabId, items.length);

      // Notify interested listeners
      try {
        await browser.runtime.sendMessage({
          type: 'MEDIA_UPDATED',
          tabId: details.tabId,
          items,
        });
      } catch {
        // No listeners — that's fine
      }
  }

  // --- Clear on navigation (not same-URL reload) ---
  browser.webNavigation.onCommitted.addListener(async (details) => {
    if (details.frameId !== 0) return;
    // transitionType 'reload' with same URL → keep list
    if (details.transitionType === 'reload') return;

    await clearTab(details.tabId);
    await updateBadge(details.tabId, 0);
  });

  // --- Clear on tab close ---
  browser.tabs.onRemoved.addListener(async (tabId) => {
    await clearTab(tabId);
    headerCache.clear(); // minor: could filter, but cheap
  });

  // --- Badge update on tab switch ---
  browser.tabs.onActivated.addListener(async (activeInfo) => {
    const count = await getCount(activeInfo.tabId);
    await updateBadge(activeInfo.tabId, count);
  });

  // --- Message handlers ---
  onMsg('GET_MEDIA_FOR_TAB', async (msg) => {
    const items = await getMediaForTab(msg.tabId);
    return { items };
  });

  onMsg('CLEAR_TAB', async (msg) => {
    await clearTab(msg.tabId);
    await updateBadge(msg.tabId, 0);
  });

  onMsg('UPDATE_MEDIA', async (msg) => {
    await updateMediaItem(msg.tabId, msg.item);
  });

  onMsg('OPEN_RECORD_TAB', async (msg) => {
    const url = browser.runtime.getURL(`/record.html?taskId=${msg.taskId}&mode=${msg.mode}`);
    await browser.tabs.create({ url });
  });

  // --- Handle downloads ---
  onMsg('START_DOWNLOAD', async (msg) => {
    const { media, variantUrl, audioOnly } = msg;
    const settings = await getSettings();

    // Query active DOM for the real, current video/page title before building filename
    if (media.tabId && media.tabId > 0) {
      try {
        const best = await getBestTitleForTab(media.tabId);
        if (best && best.trim().length > 0) {
          media.pageTitle = best;
          void updateMediaTitle(media.tabId, media.id, best);
        }
      } catch { /* best effort */ }
    }

    if (media.kind === 'file') {
      const fileName = buildFilename(settings.filenameTemplate, media);

      // Apply Referer header if the original request had one
      const taskId = `file-${Date.now()}`;
      const referer = media.requestHeaders['Referer'];
      if (referer) {
        try {
          const domain = new URL(media.url).hostname;
          await applyHeaders(taskId, [domain], {
            Referer: referer,
            Origin: media.requestHeaders['Origin'],
          });
        } catch (err) {
          log.warn('Failed to apply headers for file download', err);
        }
      }

      try {
        const downloadOptions: Browser.downloads.DownloadOptions = {
          url: media.url,
          filename: fileName,
          conflictAction: 'uniquify',
        };

        if (referer) {
          downloadOptions.headers = [
            { name: 'Referer', value: referer },
            ...(media.requestHeaders['Origin']
              ? [{ name: 'Origin', value: media.requestHeaders['Origin'] }]
              : []),
          ];
        }

        const downloadId = await browser.downloads.download(downloadOptions);
        log.info('File download started', downloadId, fileName);

        // Clean up header rules after download completes or fails
        if (referer) {
          let cleaned = false;
          const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            void removeHeaders(taskId);
            browser.downloads.onChanged.removeListener(onChanged);
          };

          const onChanged = (delta: { id: number; state?: { current?: string } }) => {
            if (delta.id === downloadId) {
              const state = delta.state?.current;
              if (state === 'complete' || state === 'interrupted') {
                cleanup();
              }
            }
          };

          browser.downloads.onChanged.addListener(onChanged);

          // Safety timeout: remove rules after 30 minutes if download never finished
          setTimeout(cleanup, 30 * 60 * 1000);
        }
      } catch (err) {
        log.error('File download failed', err);
        if (referer) void removeHeaders(taskId);
      }
      return;
    }

    // HLS / DASH download: create DownloadTask, store in local storage, open download page
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ext = audioOnly ? 'm4a' : 'mp4';
    const fileName = buildFilename(settings.filenameTemplate, media, ext);

    const task: DownloadTask = {
      id: taskId,
      media,
      variantUrl,
      mode: 'download',
      audioOnly,
      status: 'queued',
      totalSegments: 0,
      doneSegments: 0,
      bytesDownloaded: 0,
      threads: settings.threads,
      fileName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await browser.storage.local.set({ [`task:${taskId}`]: task });

    const downloadPageUrl = browser.runtime.getURL(`/download.html?taskId=${taskId}`);
    await browser.tabs.create({ url: downloadPageUrl });
    log.info('HLS/DASH download task created, opened tab', taskId);
  });

  // --- Handle playlist found from content script hook ---
  onMsg('PLAYLIST_FOUND_FROM_CONTENT', async (msg, sender) => {
    const tabId = sender.tab?.id;
    if (!tabId || tabId < 0) return;

    const kind = msg.kind as 'hls' | 'dash';
    if (kind !== 'hls' && kind !== 'dash') return;

    let pageUrl = '';
    let pageTitle = '';
    try {
      const tab = await browser.tabs.get(tabId);
      pageUrl = tab.url ?? '';
      pageTitle = tab.title ?? '';
    } catch { /* closed */ }

    const domain = (() => {
      try { return new URL(msg.url).hostname; } catch { return ''; }
    })();

    const item: DetectedMedia = {
      id: `${tabId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tabId,
      url: msg.url,
      kind,
      mime: kind === 'hls' ? 'application/vnd.apple.mpegurl' : 'application/dash+xml',
      requestHeaders: {},
      pageUrl,
      pageTitle,
      domain,
      detectedAt: Date.now(),
    };

    const items = await addMedia(item);
    log.debug('Playlist from content hook', kind, msg.url);
    await updateBadge(tabId, items.length);

    try {
      await browser.runtime.sendMessage({
        type: 'MEDIA_UPDATED',
        tabId,
        items,
      });
    } catch { /* no listeners */ }
  });

  // --- Ensure suggested filename is respected for downloads in Save As dialog ---
  interface ChromeDownloadsWithDeterminingFilename {
    downloads?: {
      onDeterminingFilename?: {
        addListener: (
          callback: (
            item: { url: string; filename: string },
            suggest: (suggestion?: { filename: string; conflictAction?: string }) => void,
          ) => void,
        ) => void;
      };
    };
  }
  const chromeObj = (globalThis as unknown as { chrome?: ChromeDownloadsWithDeterminingFilename }).chrome;
  if (chromeObj?.downloads?.onDeterminingFilename) {
    chromeObj.downloads.onDeterminingFilename.addListener(
      (item: { url: string; filename: string }, suggest: (suggestion?: { filename: string; conflictAction?: string }) => void) => {
        void (async () => {
          try {
            // 1. Check storage for registered filename by URL
            const key = `filename:${item.url}`;
            const stored = await browser.storage.local.get(key);
            const targetName = stored[key] as string | undefined;
            if (targetName) {
              suggest({ filename: targetName, conflictAction: 'uniquify' });
              await browser.storage.local.remove(key);
              return;
            }

            // 2. If filename is a UUID (common for blob downloads), look up recent task
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(item.filename);
            if (isUuid) {
              const allLocal = await browser.storage.local.get(null);
              for (const [k, v] of Object.entries(allLocal)) {
                if (k.startsWith('task:') && (v as DownloadTask).fileName) {
                  const tName = (v as DownloadTask).fileName;
                  const clean = tName.endsWith('.mp4') ? tName : `${tName}.mp4`;
                  suggest({ filename: clean, conflictAction: 'uniquify' });
                  return;
                }
              }
            }
          } catch { /* best effort */ }

          suggest();
        })();
        return true; // asynchronous response
      },
    );
  }

  // --- Helpers ---
  async function getBestTitleForTab(tabId: number): Promise<string> {
    if (tabId <= 0) return '';
    try {
      const results = await browser.scripting.executeScript({
        target: { tabId },
        func: () => {
          const og = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
          if (og && og.trim().length > 1) return og.trim();
          const tw = document.querySelector('meta[name="twitter:title"]')?.getAttribute('content');
          if (tw && tw.trim().length > 1) return tw.trim();
          const h1 = document.querySelector('h1')?.innerText?.trim();
          if (h1 && h1.length > 1 && h1.length < 150) return h1;
          const v = document.querySelector('video');
          if (v) {
            const vt = v.getAttribute('title') || v.getAttribute('aria-label');
            if (vt && vt.trim().length > 1) return vt.trim();
          }
          return document.title || '';
        },
      });
      const title = results?.[0]?.result as string | undefined;
      if (title && title.trim().length > 0) return title.trim();
    } catch {
      // Scripting might not be permitted on restricted pages
    }

    try {
      const tab = await browser.tabs.get(tabId);
      return tab?.title ?? '';
    } catch {
      return '';
    }
  }

  async function updateBadge(tabId: number, count: number): Promise<void> {
    const text = count > 0 ? String(count) : '';
    await browser.action.setBadgeText({ tabId, text });
    if (count > 0) {
      await browser.action.setBadgeBackgroundColor({
        tabId,
        color: '#6366f1',
      });
    }
  }
});
