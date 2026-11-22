import React, { useEffect, useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import ProgressBar from '@/components/ProgressBar';
import { startHlsDownload, type HlsDownloadController } from '@/core/hls/downloader';
import { startDashDownload } from '@/core/dash/downloader';
import { startLiveHlsDownload, type LiveHlsController } from '@/core/hls/live';
import { remuxToMp4, mergeTracks } from '@/core/mux/remux';
import { getOutputFile, removeTaskDir } from '@/core/storage/opfs';
import { applyHeaders, removeHeaders } from '@/core/net/header-rules';
import { getSettings } from '@/shared/settings';
import { sanitize } from '@/shared/filename';
import { log } from '@/shared/logger';
import { I18nProvider, useI18n } from '@/shared/i18n';
import type { DownloadTask, TaskStatus } from '@/shared/types';
import './style.css';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const STATUS_COLOR_CLASSES: Record<TaskStatus, string> = {
  queued: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  running: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  merging: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
  saving: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  error: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

function DownloadContent() {
  const { t } = useI18n();
  const [task, setTask] = useState<DownloadTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<TaskStatus>('queued');
  const [fileName, setFileName] = useState('');
  const [threads, setThreads] = useState(6);
  const [doneSegments, setDoneSegments] = useState(0);
  const [totalSegments, setTotalSegments] = useState(0);
  const [bytesDownloaded, setBytesDownloaded] = useState(0);
  const [speed, setSpeed] = useState(0); // bytes/sec
  const [mergeProgress, setMergeProgress] = useState(0); // 0-100
  const [errors, setErrors] = useState<string[]>([]);
  const [, setSavedUrl] = useState<string | null>(null);

  const controllerRef = useRef<HlsDownloadController | null>(null);
  const liveControllerRef = useRef<LiveHlsController | null>(null);
  const lastTimeRef = useRef<number>(Date.now());
  const lastBytesRef = useRef<number>(0);
  const taskIdRef = useRef<string>('');
  const fileNameRef = useRef<string>('');

  useEffect(() => {
    fileNameRef.current = fileName;
  }, [fileName]);

  // 1. Load task on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('taskId');
    if (!taskId) {
      setLoading(false);
      return;
    }
    taskIdRef.current = taskId;

    void (async () => {
      try {
        const stored = await browser.storage.local.get(`task:${taskId}`);
        const loadedTask = stored[`task:${taskId}`] as DownloadTask | undefined;
        if (!loadedTask) {
          setLoading(false);
          return;
        }

        setTask(loadedTask);
        setFileName(loadedTask.fileName);
        setThreads(loadedTask.threads || 6);
        setStatus(loadedTask.status);
        setDoneSegments(loadedTask.doneSegments);
        setTotalSegments(loadedTask.totalSegments);
        setBytesDownloaded(loadedTask.bytesDownloaded);
        setLoading(false);
      } catch (err) {
        log.error('Failed to load task', err);
        setLoading(false);
      }
    })();
  }, []);

  // 2. Prevent tab close during running or merging
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (status === 'running' || status === 'merging') {
        e.preventDefault();
        e.returnValue = t('leave_tab_confirm');
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [status, t]);

  // 3. Save task state periodically to browser.storage.local
  const persistTask = useCallback(async (updates: Partial<DownloadTask>) => {
    const id = taskIdRef.current;
    if (!id) return;
    try {
      const stored = await browser.storage.local.get(`task:${id}`);
      const curr = (stored[`task:${id}`] as DownloadTask) || {};
      const next: DownloadTask = { ...curr, ...updates, updatedAt: Date.now() };
      await browser.storage.local.set({ [`task:${id}`]: next });
      setTask(next);
    } catch { /* best effort */ }
  }, []);

  // 4. Save completed file to downloads
  const handleSaveFile = useCallback(async (currTask: DownloadTask) => {
    try {
      setStatus('saving');
      const file = await getOutputFile(currTask.id, 'final.mp4');
      const objectUrl = URL.createObjectURL(file);
      setSavedUrl(objectUrl);

      // Resolve the best, sanitized filename
      const rawName = fileNameRef.current || fileName || currTask.fileName || 'video';
      const cleanBase = sanitize(rawName.replace(/\.mp4$/i, ''));
      const finalFileName = `${cleanBase}.mp4`;

      // Register filename for onDeterminingFilename in background
      await browser.storage.local.set({ [`filename:${objectUrl}`]: finalFileName });

      // Trigger download via HTML5 anchor tag with explicit download attribute.
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = objectUrl;
      a.download = finalFileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 1000);

      setStatus('done');
      await persistTask({ status: 'done', fileName: finalFileName });

      // Notify
      const settings = await getSettings();
      if (settings.notify) {
        try {
          await browser.notifications.create({
            type: 'basic',
            iconUrl: browser.runtime.getURL('/icon/128.png'),
            title: t('notify_success_title'),
            message: t('notify_success_msg', [finalFileName]),
          });
        } catch { /* ignore notification errors */ }
      }

      // Cleanup OPFS after 60s
      setTimeout(() => {
        void removeTaskDir(currTask.id);
        void removeHeaders(currTask.id);
      }, 60_000);
    } catch (err) {
      log.error('Save file failed', err);
      setStatus('error');
      setErrors((prev) => [...prev, t('save_failed', [(err as Error).message])]);
    }
  }, [fileName, persistTask, t]);

  // 5. Main download execution
  const executeDownload = useCallback(async (tItem: DownloadTask, th: number) => {
    try {
      setStatus('running');
      await persistTask({ status: 'running' });

      // Apply request headers if needed
      const referer = tItem.media.requestHeaders['Referer'];
      if (referer) {
        try {
          const domain = new URL(tItem.media.url).hostname;
          await applyHeaders(tItem.id, [domain], {
            Referer: referer,
            Origin: tItem.media.requestHeaders['Origin'],
          });
        } catch (e) {
          log.warn('Could not apply DNR headers', e);
        }
      }

      const playlistUrl = tItem.variantUrl || tItem.media.url;

      if (tItem.media.kind === 'dash') {
        const dashController = await startDashDownload({
          taskId: tItem.id,
          mpdUrl: playlistUrl,
          threads: th,
          requestHeaders: tItem.media.requestHeaders,
          onStatusChange: (st) => {
            setStatus(st as TaskStatus);
            void persistTask({ status: st as TaskStatus });
          },
          onProgress: (done, total, bytes) => {
            setDoneSegments(done);
            setTotalSegments(total);
            setBytesDownloaded(bytes);

            const now = Date.now();
            const elapsed = (now - lastTimeRef.current) / 1000;
            if (elapsed >= 0.8) {
              const deltaBytes = bytes - lastBytesRef.current;
              setSpeed(Math.max(0, deltaBytes / elapsed));
              lastTimeRef.current = now;
              lastBytesRef.current = bytes;
            }

            void persistTask({
              doneSegments: done,
              totalSegments: total,
              bytesDownloaded: bytes,
            });
          },
          onError: (errMsg) => {
            setErrors((prev) => [...prev.slice(-4), errMsg]);
          },
        });

        controllerRef.current = dashController as unknown as HlsDownloadController;
        const dashResult = await dashController.done();

        if (dashResult.aborted) {
          setStatus('cancelled');
          return;
        }

        // Merge DASH video & audio
        setStatus('merging');
        await persistTask({ status: 'merging' });

        await mergeTracks({
          taskId: tItem.id,
          videoSegments: dashResult.videoSegments,
          audioSegments: dashResult.audioSegments,
          hasAudio: dashResult.hasAudio,
          outputName: 'final.mp4',
          onProgress: (done, total) => {
            setMergeProgress(Math.round((done / total) * 100));
          },
        });

        const settings = await getSettings();
        if (settings.autoSave) {
          await handleSaveFile(tItem);
        } else {
          setStatus('saving');
        }
        return;
      }

      if (tItem.media.isLive && tItem.media.kind === 'hls') {
        const liveController = await startLiveHlsDownload({
          taskId: tItem.id,
          playlistUrl,
          requestHeaders: tItem.media.requestHeaders,
          onProgress: (done, bytes, _dur) => {
            setDoneSegments(done);
            setTotalSegments(done + 3);
            setBytesDownloaded(bytes);
          },
          onStatusChange: (st) => {
            setStatus(st as TaskStatus);
            void persistTask({ status: st as TaskStatus });
          },
          onError: (errMsg) => {
            setErrors((prev) => [...prev.slice(-4), errMsg]);
          },
        });

        liveControllerRef.current = liveController;
        return;
      }

      const controller = await startHlsDownload({
        taskId: tItem.id,
        playlistUrl,
        threads: th,
        requestHeaders: tItem.media.requestHeaders,
        onStatusChange: (st) => {
          setStatus(st as TaskStatus);
          void persistTask({ status: st as TaskStatus });
        },
        onProgress: (done, total, bytes) => {
          setDoneSegments(done);
          setTotalSegments(total);
          setBytesDownloaded(bytes);

          // Speed & ETA calculation
          const now = Date.now();
          const elapsed = (now - lastTimeRef.current) / 1000;
          if (elapsed >= 0.8) {
            const deltaBytes = bytes - lastBytesRef.current;
            const currentSpeed = Math.max(0, deltaBytes / elapsed);
            setSpeed(currentSpeed);
            lastTimeRef.current = now;
            lastBytesRef.current = bytes;
          }

          void persistTask({
            doneSegments: done,
            totalSegments: total,
            bytesDownloaded: bytes,
          });
        },
        onError: (errMsg) => {
          setErrors((prev) => [...prev.slice(-4), errMsg]);
        },
      });

      controllerRef.current = controller;
      const result = await controller.done();

      if (result.aborted) {
        setStatus('cancelled');
        return;
      }

      // Step 2: Remux to MP4
      setStatus('merging');
      await persistTask({ status: 'merging' });

      const discontinuities = result.media.segments
        .filter((s) => s.discontinuity)
        .map((s) => s.idx);

      await remuxToMp4({
        taskId: tItem.id,
        totalSegments: result.totalSegments,
        isFmp4: result.isFmp4,
        outputName: 'final.mp4',
        discontinuities,
        onProgress: (done, total) => {
          setMergeProgress(Math.round((done / total) * 100));
        },
      });

      // Step 3: Check settings for autoSave
      const settings = await getSettings();
      if (settings.autoSave) {
        await handleSaveFile(tItem);
      } else {
        setStatus('saving');
      }
    } catch (err) {
      log.error('Download execution error', err);
      setStatus('error');
      setErrors((prev) => [...prev, (err as Error).message]);
      await persistTask({
        status: 'error',
        error: { code: 'EXEC_ERROR', message: (err as Error).message },
      });
    }
  }, [persistTask, handleSaveFile]);

  // Trigger download once task is ready
  useEffect(() => {
    if (task && status === 'queued') {
      void executeDownload(task, threads);
    }
  }, [task, status, threads, executeDownload]);

  // Controls
  const handlePause = () => {
    controllerRef.current?.pause();
    setStatus('paused');
    void persistTask({ status: 'paused' });
  };

  const handleResume = () => {
    controllerRef.current?.resume();
    setStatus('running');
    void persistTask({ status: 'running' });
  };

  const handleCancel = () => {
    if (confirm(t('cancel_confirm'))) {
      controllerRef.current?.abort();
      liveControllerRef.current?.abort();
      setStatus('cancelled');
      void persistTask({ status: 'cancelled' });
      if (task) {
        void removeTaskDir(task.id);
        void removeHeaders(task.id);
      }
    }
  };

  const handleStopLive = async () => {
    if (liveControllerRef.current && task) {
      setStatus('merging');
      const ext = task.audioOnly ? 'm4a' : 'mp4';
      const outputName = `live-${Date.now()}.${ext}`;
      await liveControllerRef.current.stopAndSave(outputName);
      await handleSaveFile(task);
    }
  };

  const handleThreadChange = (n: number) => {
    setThreads(n);
    controllerRef.current?.setThreads(n);
    void persistTask({ threads: n });
  };

  // Calculations
  const downloadPercent = totalSegments > 0 ? (doneSegments / totalSegments) * 100 : 0;
  const remainingBytes = speed > 0 && totalSegments > 0 && doneSegments > 0
    ? ((bytesDownloaded / doneSegments) * (totalSegments - doneSegments))
    : 0;
  const etaSeconds = speed > 0 ? remainingBytes / speed : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center text-gray-500">{t('loading_task')}</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg max-w-md w-full text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('task_not_found')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {t('task_not_found_desc')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 w-full max-w-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div>
              <h1 className="text-lg font-bold">{t('download_page_title')}</h1>
              <p className="text-xs text-gray-400 truncate max-w-sm">{task.media.domain}</p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR_CLASSES[status] || 'bg-gray-100 text-gray-700'}`}>
            {t(`status_${status}`) || status}
          </span>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">

          {/* Warning banner */}
          {(status === 'running' || status === 'merging') && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl p-3 flex items-center gap-3 text-xs text-amber-800 dark:text-amber-300">
              <span className="text-base animate-pulse">⚠️</span>
              <span><strong>{t('keep_tab_open_warning')}</strong></span>
            </div>
          )}

          {/* File Name input */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              {t('file_name_label')}
            </label>
            <input
              type="text"
              value={fileName}
              disabled={status === 'done' || status === 'saving'}
              onChange={(e) => {
                setFileName(e.target.value);
                void persistTask({ fileName: e.target.value });
              }}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          {/* Progress Section */}
          <div className="space-y-3 bg-gray-50/70 dark:bg-gray-900/40 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
            {status === 'merging' ? (
              <ProgressBar
                progress={mergeProgress}
                status={t('merging_status', [mergeProgress])}
                colorClass="bg-purple-600"
              />
            ) : (
              <ProgressBar
                progress={downloadPercent}
                status={status === 'done' ? t('download_complete_status') : t('download_progress_status', [doneSegments, totalSegments])}
                colorClass={status === 'paused' ? 'bg-amber-500' : 'bg-indigo-600'}
              />
            )}

            {/* Metrics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-center text-xs">
              <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700">
                <span className="text-gray-400 block text-[11px]">{t('metric_downloaded')}</span>
                <strong className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {formatBytes(bytesDownloaded)}
                </strong>
              </div>
              <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700">
                <span className="text-gray-400 block text-[11px]">{t('metric_speed')}</span>
                <strong className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {status === 'running' ? `${(speed / (1024 * 1024)).toFixed(2)} MB/s` : '--'}
                </strong>
              </div>
              <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700">
                <span className="text-gray-400 block text-[11px]">{t('metric_eta')}</span>
                <strong className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {status === 'running' ? formatEta(etaSeconds) : '--:--'}
                </strong>
              </div>
              <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700">
                <span className="text-gray-400 block text-[11px]">{t('metric_segments')}</span>
                <strong className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {doneSegments} / {totalSegments}
                </strong>
              </div>
            </div>
          </div>

          {/* Thread control */}
          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
            <span>{t('parallel_threads')}</span>
            <div className="flex gap-1">
              {[2, 4, 6, 8, 12].map((num) => (
                <button
                  key={num}
                  disabled={status === 'merging' || status === 'done'}
                  onClick={() => handleThreadChange(num)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                    threads === num
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Error log box if any */}
          {errors.length > 0 && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300 space-y-1">
              <span className="font-semibold block">{t('error_log_title')}</span>
              {errors.map((e, idx) => (
                <div key={idx} className="truncate">• {e}</div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            {status === 'running' && (
              <>
                {task?.media.isLive && (
                  <button
                    onClick={handleStopLive}
                    className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-sm transition"
                  >
                    {t('btn_stop_live')}
                  </button>
                )}
                <button
                  onClick={handlePause}
                  className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-sm transition"
                >
                  ⏸ {t('btn_pause')}
                </button>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-xs font-semibold bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 text-gray-700 dark:text-gray-200 rounded-lg transition"
                >
                  ✕ {t('btn_cancel')}
                </button>
              </>
            )}

            {status === 'paused' && (
              <>
                <button
                  onClick={handleResume}
                  className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm transition"
                >
                  ▶ {t('btn_resume')}
                </button>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-xs font-semibold bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 text-gray-700 dark:text-gray-200 rounded-lg transition"
                >
                  ✕ {t('btn_cancel')}
                </button>
              </>
            )}

            {(status === 'saving' || status === 'done') && (
              <button
                onClick={() => handleSaveFile(task)}
                className="px-5 py-2.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition flex items-center gap-2"
              >
                <span>💾 {t('btn_save_file')}</span>
              </button>
            )}

            {status === 'error' && (
              <button
                onClick={() => executeDownload(task, threads)}
                className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm transition"
              >
                🔄 {t('btn_retry')}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

function DownloadPage() {
  return (
    <I18nProvider>
      <DownloadContent />
    </I18nProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DownloadPage />
  </React.StrictMode>,
);
