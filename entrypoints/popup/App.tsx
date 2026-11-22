import React, { useEffect, useState, useCallback } from 'react';
import MediaList from '@/components/MediaList';
import { sendMsg } from '@/shared/messages';
import { enrich } from '@/core/detect/enrich';
import { getSettings, setSettings } from '@/shared/settings';
import { I18nProvider, useI18n } from '@/shared/i18n';
import type { DetectedMedia, DownloadTask, TaskStatus } from '@/shared/types';

const STATUS_COLORS: Record<TaskStatus, string> = {
  queued: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  running: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',
  merging: 'bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300',
  saving: 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300',
  error: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

function PopupContent() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'media' | 'tasks'>('media');
  const [items, setItems] = useState<DetectedMedia[]>([]);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);

  const loadTasks = useCallback(async () => {
    try {
      const all = await browser.storage.local.get(null);
      const list: DownloadTask[] = [];
      for (const [k, v] of Object.entries(all)) {
        if (k.startsWith('task:')) {
          list.push(v as DownloadTask);
        }
      }
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      setTasks(list);
    } catch {
      // Best effort
    }
  }, []);

  useEffect(() => {
    void loadTasks();

    // Listen for storage changes to refresh tasks
    const storageListener = (changes: Record<string, Browser.storage.StorageChange>, area: string) => {
      if (area === 'local') {
        const hasTaskChange = Object.keys(changes).some((k) => k.startsWith('task:'));
        if (hasTaskChange) void loadTasks();
      }
    };
    browser.storage.onChanged.addListener(storageListener);

    // Load current tab's media
    browser.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
      const tab = tabs[0];
      const tabId = tab?.id;
      if (!tabId) return;

      const settings = await getSettings();
      const resp = await sendMsg({ type: 'GET_MEDIA_FOR_TAB', tabId });
      const currentTitle = tab.title ?? '';
      const filtered = resp.items
        .filter((m) => !settings.blockedDomains.includes(m.domain))
        .map((m) => {
          if ((!m.pageTitle || m.pageTitle === 'video') && currentTitle) {
            return { ...m, pageTitle: currentTitle };
          }
          return m;
        });
      setItems(filtered);

      // T1.6: Enrich metadata on-demand
      for (const item of filtered) {
        const needsEnrich =
          (item.kind === 'file' && !item.size) ||
          (item.kind === 'hls' && (!item.variants || !item.duration)) ||
          (item.kind === 'dash' && (!item.duration || !item.variants));

        if (needsEnrich) {
          void enrich(item).then(async (enriched) => {
            setItems((prev) =>
              prev.map((m) => (m.id === enriched.id ? { ...m, ...enriched } : m)),
            );
            await sendMsg({ type: 'UPDATE_MEDIA', tabId, item: enriched }).catch(() => {});
          });
        }
      }
    });

    // Listen for updates from sniffer
    const listener = (msg: unknown) => {
      if (
        typeof msg === 'object' && msg !== null &&
        (msg as { type: string }).type === 'MEDIA_UPDATED'
      ) {
        const data = msg as { tabId: number; items: DetectedMedia[] };
        browser.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
          if (tabs[0]?.id === data.tabId) {
            const settings = await getSettings();
            setItems(data.items.filter((m) => !settings.blockedDomains.includes(m.domain)));
          }
        });
      }
    };
    browser.runtime.onMessage.addListener(listener);

    return () => {
      browser.runtime.onMessage.removeListener(listener);
      browser.storage.onChanged.removeListener(storageListener);
    };
  }, [loadTasks]);

  const handleDownload = (item: DetectedMedia, variantUrl?: string, audioOnly?: boolean) => {
    sendMsg({
      type: 'START_DOWNLOAD',
      media: item,
      variantUrl,
      audioOnly,
    }).catch(() => {});
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url).catch(() => {});
  };

  const handleHideDomain = async (domain: string) => {
    if (!domain) return;
    const settings = await getSettings();
    if (!settings.blockedDomains.includes(domain)) {
      const updated = [...settings.blockedDomains, domain];
      await setSettings({ blockedDomains: updated });
      setItems((prev) => prev.filter((m) => m.domain !== domain));
    }
  };

  const handleOpenTask = (taskId: string) => {
    const url = browser.runtime.getURL(`/download.html?taskId=${taskId}`);
    void browser.tabs.create({ url });
  };

  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await browser.storage.local.remove(`task:${taskId}`);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const handleOpenOptions = () => {
    void browser.runtime.openOptionsPage();
  };

  return (
    <div className="w-[380px] max-h-[540px] flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-3 py-2 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-base">⚡</span>
          <h1 className="text-sm font-bold tracking-tight">VidGrab</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Settings button */}
          <button
            onClick={handleOpenOptions}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
            title={t('header_settings')}
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 text-xs font-semibold px-2 bg-gray-50 dark:bg-gray-800/40">
        <button
          onClick={() => setActiveTab('media')}
          className={`flex-1 py-2 text-center border-b-2 transition flex items-center justify-center gap-1.5 ${
            activeTab === 'media'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          <span>{t('tab_media')}</span>
          <span className="px-1.5 py-0.2 bg-gray-200 dark:bg-gray-700 rounded-full text-[10px]">
            {items.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex-1 py-2 text-center border-b-2 transition flex items-center justify-center gap-1.5 ${
            activeTab === 'tasks'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          <span>{t('tab_tasks')}</span>
          <span className="px-1.5 py-0.2 bg-gray-200 dark:bg-gray-700 rounded-full text-[10px]">
            {tasks.length}
          </span>
        </button>
      </div>

      {/* Body content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'media' ? (
          <MediaList
            items={items}
            onDownload={handleDownload}
            onCopy={handleCopy}
            onHideDomain={handleHideDomain}
          />
        ) : (
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs">
                {t('no_tasks')}
              </div>
            ) : (
              tasks.map((taskItem) => {
                const statusLabel = t(`status_${taskItem.status}`) || taskItem.status;
                const statusColor = STATUS_COLORS[taskItem.status] || 'bg-gray-100 text-gray-700';
                const pct = taskItem.totalSegments > 0 ? Math.round((taskItem.doneSegments / taskItem.totalSegments) * 100) : 0;

                return (
                  <div
                    key={taskItem.id}
                    onClick={() => handleOpenTask(taskItem.id)}
                    className="p-2.5 rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800/60 hover:border-indigo-300 dark:hover:border-indigo-700 cursor-pointer transition shadow-xs space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold truncate flex-1 text-gray-800 dark:text-gray-200">
                        {taskItem.fileName || taskItem.media?.pageTitle || t('default_task_name')}
                      </p>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>

                    {/* Progress bar */}
                    {taskItem.status === 'running' || taskItem.status === 'paused' || taskItem.status === 'merging' ? (
                      <div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-indigo-600 h-full transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                          <span>{taskItem.doneSegments} / {taskItem.totalSegments} segs</span>
                          <span>{pct}%</span>
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between text-[11px] text-gray-400 pt-0.5">
                      <span>{new Date(taskItem.updatedAt).toLocaleTimeString()}</span>
                      <button
                        onClick={(e) => handleDeleteTask(taskItem.id, e)}
                        className="text-gray-400 hover:text-rose-500 font-bold px-1"
                        title={t('delete_task_title')}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <PopupContent />
    </I18nProvider>
  );
}
