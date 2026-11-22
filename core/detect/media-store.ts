import type { DetectedMedia } from '../../shared/types';
import { sendMsg } from '../../shared/messages';
import { log } from '../../shared/logger';

const MAX_PER_TAB = 100;

function storageKey(tabId: number): string {
  return `tab:${tabId}`;
}

/**
 * Deduplicate by stripping variable query params and keeping latest.
 * Key = URL without query string.
 */
function dedupeKey(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

export async function getMediaForTab(tabId: number): Promise<DetectedMedia[]> {
  const key = storageKey(tabId);
  const data = await browser.storage.session.get(key);
  return (data[key] as DetectedMedia[] | undefined) ?? [];
}

export async function addMedia(item: DetectedMedia): Promise<DetectedMedia[]> {
  const key = storageKey(item.tabId);
  const existing = await getMediaForTab(item.tabId);

  // Dedupe: keep latest entry per base URL
  const dk = dedupeKey(item.url);
  const filtered = existing.filter((m) => dedupeKey(m.url) !== dk);
  filtered.push(item);

  // Limit per tab
  const trimmed = filtered.length > MAX_PER_TAB
    ? filtered.slice(filtered.length - MAX_PER_TAB)
    : filtered;

  await browser.storage.session.set({ [key]: trimmed });
  return trimmed;
}

export async function clearTab(tabId: number): Promise<void> {
  const key = storageKey(tabId);
  await browser.storage.session.remove(key);
}

export async function updateMediaTitle(
  tabId: number,
  mediaId: string,
  title: string,
): Promise<void> {
  const key = storageKey(tabId);
  const items = await getMediaForTab(tabId);
  const target = items.find((m) => m.id === mediaId);
  if (target && target.pageTitle !== title) {
    target.pageTitle = title;
    await browser.storage.session.set({ [key]: items });
  }
}

export async function updateMediaItem(
  tabId: number,
  item: DetectedMedia,
): Promise<void> {
  const key = storageKey(tabId);
  const items = await getMediaForTab(tabId);
  const idx = items.findIndex((m) => m.id === item.id);
  if (idx !== -1) {
    items[idx] = { ...items[idx], ...item };
    await browser.storage.session.set({ [key]: items });
  }
}

export async function getCount(tabId: number): Promise<number> {
  return (await getMediaForTab(tabId)).length;
}
