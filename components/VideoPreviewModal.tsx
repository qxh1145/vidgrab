import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import type { DetectedMedia } from '@/shared/types';
import { useI18n } from '@/shared/i18n';

interface Props {
  item: DetectedMedia;
  variantUrl?: string;
  onClose: () => void;
}

export default function VideoPreviewModal({ item, variantUrl, onClose }: Props) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sourceUrl = variantUrl || item.url;

    if (item.kind === 'hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });
        hlsRef.current = hls;
        hls.loadSource(sourceUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          void video.play().catch(() => {});
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = sourceUrl;
        void video.play().catch(() => {});
      }
    } else {
      video.src = sourceUrl;
      void video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (video) {
        video.pause();
        video.src = '';
      }
    };
  }, [item, variantUrl]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700">
          <span className="text-xs font-semibold truncate pr-2 text-gray-800 dark:text-gray-200">
            👁 {t('preview_modal_title')} {item.pageTitle || 'Video'}
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm font-bold px-1"
          >
            ✕
          </button>
        </div>

        <div className="p-2 bg-black flex items-center justify-center">
          <video
            ref={videoRef}
            controls
            autoPlay
            muted
            playsInline
            className="w-full max-h-56 rounded"
          />
        </div>

        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/80 text-[11px] text-gray-500 dark:text-gray-400 flex items-center justify-between">
          <span>{item.kind.toUpperCase()} {variantUrl ? '· Variant' : ''} ({t('preview_muted_notice')})</span>
          <button
            onClick={onClose}
            className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-xs text-gray-700 dark:text-gray-300 transition"
          >
            {t('btn_close')}
          </button>
        </div>
      </div>
    </div>
  );
}
