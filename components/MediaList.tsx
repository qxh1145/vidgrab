import React, { useState, useMemo } from 'react';
import type { DetectedMedia } from '@/shared/types';
import VideoPreviewModal from './VideoPreviewModal';
import { useI18n } from '@/shared/i18n';

const KIND_ICONS: Record<string, string> = {
  hls: '📡',
  dash: '🎬',
  file: '📄',
};

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(sec?: number): string {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function domainOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

interface Props {
  items: DetectedMedia[];
  onDownload: (item: DetectedMedia, variantUrl?: string, audioOnly?: boolean) => void;
  onCopy: (url: string) => void;
  onHideDomain: (domain: string) => void;
}

export default function MediaList({ items, onDownload, onCopy, onHideDomain }: Props) {
  const { t } = useI18n();
  const [filterDomain, setFilterDomain] = useState('');
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [previewItem, setPreviewItem] = useState<{ item: DetectedMedia; variantUrl?: string } | null>(null);

  const domains = useMemo(
    () => [...new Set(items.map((m) => m.domain).filter(Boolean))],
    [items],
  );

  const filtered = filterDomain
    ? items.filter((m) => m.domain === filterDomain)
    : items;

  if (items.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
        <p className="text-2xl mb-1">🎥</p>
        <p className="font-medium text-gray-600 dark:text-gray-300">{t('no_videos_found')}</p>
        <p className="mt-1 text-xs">{t('no_videos_hint')}</p>
      </div>
    );
  }

  const handleSelectVariant = (mediaId: string, url: string) => {
    setSelectedVariants((prev) => ({ ...prev, [mediaId]: url }));
  };

  return (
    <div>
      {/* Domain filter dropdown if multiple domains exist */}
      {domains.length > 1 && (
        <select
          className="w-full mb-2 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          value={filterDomain}
          onChange={(e) => setFilterDomain(e.target.value)}
        >
          <option value="">{t('all_domains')} ({items.length})</option>
          {domains.map((d) => (
            <option key={d} value={d}>
              {d} ({items.filter((m) => m.domain === d).length})
            </option>
          ))}
        </select>
      )}

      <ul className="space-y-2">
        {filtered.map((item) => {
          const hasVariants = Boolean(item.variants && item.variants.length > 0);
          // Default variant: highest resolution/bandwidth
          const defaultVariantUrl = hasVariants
            ? item.variants!.reduce((best, cur) => (cur.bandwidth > best.bandwidth ? cur : best), item.variants![0]!).url
            : undefined;

          const currentVariantUrl = selectedVariants[item.id] || defaultVariantUrl;

          return (
            <li
              key={item.id}
              className="flex flex-col gap-1.5 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800/60 shadow-sm hover:border-indigo-200 dark:hover:border-indigo-800 transition"
            >
              <div className="flex items-start gap-2 text-sm">
                <span className="text-xl flex-shrink-0 mt-0.5" title={item.kind.toUpperCase()}>
                  {KIND_ICONS[item.kind] ?? '📄'}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-xs sm:text-sm text-gray-900 dark:text-gray-100">
                    {item.pageTitle || domainOf(item.url) || 'Video'}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                    {item.domain}
                    {item.size ? ` · ${formatSize(item.size)}` : ''}
                    {item.duration ? ` · ${formatDuration(item.duration)}` : ''}
                    {' · '}
                    <span className="font-semibold uppercase">{item.kind}</span>
                  </p>
                </div>
              </div>

              {/* T4.1: Variant resolution selector */}
              {hasVariants && (
                <div className="flex items-center gap-1.5 pt-1 text-xs">
                  <span className="text-[11px] text-gray-400">{t('resolution_label')}</span>
                  <select
                    value={currentVariantUrl}
                    onChange={(e) => handleSelectVariant(item.id, e.target.value)}
                    className="flex-1 px-2 py-0.5 text-[11px] border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                  >
                    {item.variants!.map((v, idx) => (
                      <option key={idx} value={v.url}>
                        {v.label || (v.resolution ? `${v.resolution.height}p` : 'Auto')}
                        {v.bandwidth ? ` (${Math.round(v.bandwidth / 1000)} kbps)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-gray-50 dark:border-gray-700/60">
                {/* T4.2: Preview Button */}
                <button
                  onClick={() => setPreviewItem({ item, variantUrl: currentVariantUrl })}
                  className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded flex items-center gap-1 transition"
                  title={t('btn_preview')}
                >
                  <span>👁</span>
                  <span className="hidden sm:inline">{t('btn_preview')}</span>
                </button>

                {/* Copy URL */}
                <button
                  onClick={() => onCopy(currentVariantUrl || item.url)}
                  className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition"
                  title={t('btn_copy_link')}
                >
                  📋
                </button>

                {/* Hide domain */}
                <button
                  onClick={() => onHideDomain(item.domain)}
                  className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-gray-500 hover:text-rose-600 dark:text-gray-400 rounded transition"
                  title={t('btn_hide_domain')}
                >
                  🚫
                </button>

                {/* Audio-only download button for streams (T7.3) */}
                {item.kind !== 'file' && (
                  <button
                    onClick={() => onDownload(item, currentVariantUrl, true)}
                    className="px-2 py-1 text-xs bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded transition flex items-center gap-1"
                    title={t('btn_audio_only')}
                  >
                    <span>🎵 M4A</span>
                  </button>
                )}

                {/* Download Button */}
                <button
                  onClick={() => onDownload(item, currentVariantUrl, false)}
                  className="px-3 py-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded shadow-sm transition flex items-center gap-1"
                  title={t('btn_download_title')}
                >
                  <span>⬇ {t('btn_download')}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* T4.2: Preview Modal */}
      {previewItem && (
        <VideoPreviewModal
          item={previewItem.item}
          variantUrl={previewItem.variantUrl}
          onClose={() => setPreviewItem(null)}
        />
      )}
    </div>
  );
}
