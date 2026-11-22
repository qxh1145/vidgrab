import React, { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { writeTrackSegment, getOutputFile, removeTaskDir } from '@/core/storage/opfs';
import { mergeTracks } from '@/core/mux/remux';
import { getSettings } from '@/shared/settings';
import { log } from '@/shared/logger';
import { I18nProvider, useI18n } from '@/shared/i18n';
import '@/entrypoints/download/style.css';

function RecordContent() {
  const { t } = useI18n();
  const [taskId, setTaskId] = useState('');
  const [mode, setMode] = useState<'mse' | 'realtime'>('mse');
  const [status, setStatus] = useState<'recording' | 'processing' | 'done' | 'error'>('recording');
  const [durationSec, setDurationSec] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);
  const [bytesRecorded, setBytesRecorded] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const videoChunksCount = useRef(0);
  const audioChunksCount = useRef(0);
  const realtimeBlobs = useRef<Blob[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('taskId') || `rec-${Date.now()}`;
    const m = (params.get('mode') as 'mse' | 'realtime') || 'mse';
    setTaskId(id);
    setMode(m);

    // Duration timer
    const timer = setInterval(() => {
      setDurationSec((prev) => prev + 1);
    }, 1000);

    // Chunk listener
    const listener = (msg: unknown) => {
      if (typeof msg !== 'object' || msg === null) return;
      const data = msg as { type: string; taskId?: string; track?: string; data?: number[] };

      if (data.taskId !== id) return;

      if (data.type === 'MSE_CHUNK_RECEIVED' && data.data) {
        const uint8 = new Uint8Array(data.data);
        const track = (data.track as 'video' | 'audio') || 'video';
        const idx = track === 'video' ? videoChunksCount.current++ : audioChunksCount.current++;

        void writeTrackSegment(id, track, idx, uint8.buffer as ArrayBuffer);
        setChunkCount((prev) => prev + 1);
        setBytesRecorded((prev) => prev + uint8.byteLength);
      } else if (data.type === 'REALTIME_CHUNK_RECEIVED' && data.data) {
        const uint8 = new Uint8Array(data.data);
        const blob = new Blob([uint8], { type: 'video/webm' });
        realtimeBlobs.current.push(blob);
        setChunkCount((prev) => prev + 1);
        setBytesRecorded((prev) => prev + uint8.byteLength);
      }
    };

    browser.runtime.onMessage.addListener(listener);

    return () => {
      clearInterval(timer);
      browser.runtime.onMessage.removeListener(listener);
    };
  }, []);

  const handleStopAndSave = async () => {
    setStatus('processing');

    try {
      // 1. Tell overlay to stop capturing
      await browser.runtime.sendMessage({ type: 'STOP_RECORDING', taskId }).catch(() => {});

      const dateStr = new Date().toISOString().slice(0, 10);
      const outputFilename = `VidGrab_Record_${dateStr}_${Date.now()}.mp4`;

      if (mode === 'mse') {
        const hasAudio = audioChunksCount.current > 0;
        await mergeTracks({
          taskId,
          videoSegments: Math.max(1, videoChunksCount.current),
          audioSegments: audioChunksCount.current,
          hasAudio,
          outputName: outputFilename,
        });

        const file = await getOutputFile(taskId, outputFilename);
        const url = URL.createObjectURL(file);

        await browser.downloads.download({
          url,
          filename: outputFilename,
          conflictAction: 'uniquify',
        });
      } else {
        // Realtime
        const combined = new Blob(realtimeBlobs.current, { type: 'video/webm' });
        const url = URL.createObjectURL(combined);
        const extFilename = outputFilename.replace('.mp4', '.webm');

        await browser.downloads.download({
          url,
          filename: extFilename,
          conflictAction: 'uniquify',
        });
      }

      setStatus('done');

      // Notify
      const settings = await getSettings();
      if (settings.notify) {
        try {
          await browser.notifications.create({
            type: 'basic',
            iconUrl: browser.runtime.getURL('/icon/128.png'),
            title: t('notify_success_title'),
            message: t('record_status_done'),
          });
        } catch {}
      }

      // Cleanup OPFS after 1 min
      setTimeout(() => {
        void removeTaskDir(taskId);
      }, 60_000);
    } catch (err) {
      log.error('Record save failed', err);
      setStatus('error');
      setErrorMessage((err as Error).message);
    }
  };

  const handleCancel = () => {
    if (confirm(t('cancel_confirm'))) {
      void browser.runtime.sendMessage({ type: 'STOP_RECORDING', taskId }).catch(() => {});
      void removeTaskDir(taskId);
      window.close();
    }
  };

  const formatTime = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${mb.toFixed(2)} MB`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 p-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔴</span>
            <div>
              <h1 className="text-base font-bold">{t('record_page_title')}</h1>
              <span className="text-xs text-gray-400">
                {mode === 'mse' ? t('record_overlay_mse') : t('record_overlay_realtime')}
              </span>
            </div>
          </div>

          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              status === 'recording'
                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 animate-pulse'
                : status === 'processing'
                ? 'bg-amber-100 text-amber-700'
                : status === 'done'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {status === 'recording'
              ? `● ${t('record_status_recording')}`
              : status === 'processing'
              ? t('record_status_processing')
              : status === 'done'
              ? t('record_status_done')
              : t('record_status_error')}
          </span>
        </div>

        {/* Stats Display */}
        <div className="text-center py-6 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-100 dark:border-gray-800">
          <div className="text-4xl sm:text-5xl font-mono font-bold tracking-wider text-gray-900 dark:text-gray-100">
            {formatTime(durationSec)}
          </div>
          <div className="grid grid-cols-2 gap-4 mt-6 text-xs text-gray-500 dark:text-gray-400">
            <div>
              <span className="block text-[11px]">{t('record_metric_size')}</span>
              <strong className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {formatSize(bytesRecorded)}
              </strong>
            </div>
            <div>
              <span className="block text-[11px]">{t('record_metric_chunks')}</span>
              <strong className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {chunkCount}
              </strong>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
            {errorMessage}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {status === 'recording' && (
            <>
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-300 rounded-lg transition"
              >
                ✕ {t('btn_cancel')}
              </button>
              <button
                onClick={handleStopAndSave}
                className="px-5 py-2.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-sm transition flex items-center gap-1.5"
              >
                <span>{t('btn_stop_record')}</span>
              </button>
            </>
          )}

          {status === 'processing' && (
            <span className="text-xs text-gray-400 italic">{t('record_status_processing')}</span>
          )}

          {status === 'done' && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-emerald-600 font-semibold">✓ {t('record_status_done')}</span>
              <button
                onClick={() => window.close()}
                className="px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg"
              >
                {t('btn_close')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecordPage() {
  return (
    <I18nProvider>
      <RecordContent />
    </I18nProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RecordPage />
  </React.StrictMode>,
);
