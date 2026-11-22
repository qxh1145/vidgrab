import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { getSettings, setSettings, type Settings } from '@/shared/settings';
import { estimateUsage, listTaskDirs, removeTaskDir } from '@/core/storage/opfs';
import { I18nProvider, useI18n, type Language } from '@/shared/i18n';
import '@/entrypoints/download/style.css';

function OptionsContent() {
  const { t, setLanguage } = useI18n();
  const [settings, setSettingsState] = useState<Settings | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [newBlockedDomain, setNewBlockedDomain] = useState('');
  const [storageInfo, setStorageInfo] = useState<{ usage: number; quota: number }>({ usage: 0, quota: 0 });
  const [taskDirCount, setTaskDirCount] = useState(0);
  const [clearingStorage, setClearingStorage] = useState(false);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    const s = await getSettings();
    setSettingsState(s);

    try {
      const usage = await estimateUsage();
      setStorageInfo(usage);
      const dirs = await listTaskDirs();
      setTaskDirCount(dirs.length);
    } catch {
      // Best effort
    }
  }

  const handleSave = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const updated = await setSettings(patch);
    setSettingsState(updated);
    if (patch.language) {
      setLanguage(patch.language);
    }
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleAddBlockedDomain = () => {
    if (!settings || !newBlockedDomain.trim()) return;
    const d = newBlockedDomain.trim().toLowerCase();
    if (settings.blockedDomains.includes(d)) return;
    const updated = [...settings.blockedDomains, d];
    void handleSave({ blockedDomains: updated });
    setNewBlockedDomain('');
  };

  const handleRemoveBlockedDomain = (domain: string) => {
    if (!settings) return;
    const updated = settings.blockedDomains.filter((d) => d !== domain);
    void handleSave({ blockedDomains: updated });
  };

  const handleClearOpfs = async () => {
    if (!confirm(t('clear_storage_confirm'))) return;
    setClearingStorage(true);
    try {
      const dirs = await listTaskDirs();
      for (const d of dirs) {
        await removeTaskDir(d);
      }
      await loadData();
    } finally {
      setClearingStorage(false);
    }
  };

  const handleResetDefaults = async () => {
    if (!confirm(t('reset_defaults_confirm'))) return;
    const defaults: Settings = {
      threads: 6,
      autoSave: true,
      notify: true,
      filenameTemplate: '{title}_{quality}',
      minSizeKB: 200,
      blockedDomains: [],
      language: 'auto',
    };
    await setSettings(defaults);
    setSettingsState(defaults);
    setLanguage('auto');
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  if (!settings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500 text-sm">
        {t('loading_task')}
      </div>
    );
  }

  const formatMB = (bytes: number) => {
    if (bytes <= 0) return '0 MB';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <span>⚙️ {t('options_title')}</span>
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('options_desc')}
            </p>
          </div>
          {savedNotice && (
            <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-medium rounded-full animate-fade-in">
              ✓ {t('options_saved_notice')}
            </span>
          )}
        </div>

        {/* 1. Download Settings */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 border-b pb-2 dark:border-gray-700">
            {t('section_download')}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('setting_threads')} <strong className="text-indigo-600">{settings.threads}</strong>
              </label>
              <input
                type="range"
                min="1"
                max="16"
                value={settings.threads}
                onChange={(e) => handleSave({ threads: parseInt(e.target.value, 10) })}
                className="w-full accent-indigo-600"
              />
              <span className="text-[11px] text-gray-400">{t('setting_threads_hint')}</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('setting_min_size')}
              </label>
              <input
                type="number"
                min="0"
                value={settings.minSizeKB}
                onChange={(e) => handleSave({ minSizeKB: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                className="w-full px-3 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-[11px] text-gray-400">{t('setting_min_size_hint')}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('setting_filename_template')}
            </label>
            <input
              type="text"
              value={settings.filenameTemplate}
              onChange={(e) => handleSave({ filenameTemplate: e.target.value })}
              className="w-full px-3 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500 font-mono"
            />
            <span className="text-[11px] text-gray-400 block mt-1">
              {t('setting_filename_template_hint')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Language Selection (T8.1) */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('setting_language')}
              </label>
              <select
                value={settings.language || 'auto'}
                onChange={(e) => handleSave({ language: e.target.value as Language })}
                className="w-full px-3 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500 bg-white"
              >
                <option value="auto">{t('lang_auto')}</option>
                <option value="vi">{t('lang_vi')}</option>
                <option value="en">{t('lang_en')}</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoSave}
                onChange={(e) => handleSave({ autoSave: e.target.checked })}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>{t('setting_auto_save')}</span>
            </label>

            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notify}
                onChange={(e) => handleSave({ notify: e.target.checked })}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>{t('setting_notify')}</span>
            </label>
          </div>
        </div>

        {/* 2. Blocked Domains */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 border-b pb-2 dark:border-gray-700">
            {t('section_blocked_domains', [settings.blockedDomains.length])}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('section_blocked_domains_desc')}
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t('add_domain_placeholder')}
              value={newBlockedDomain}
              onChange={(e) => setNewBlockedDomain(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddBlockedDomain()}
              className="flex-1 px-3 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
            />
            <button
              onClick={handleAddBlockedDomain}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-semibold hover:bg-indigo-700"
            >
              {t('btn_add')}
            </button>
          </div>

          {settings.blockedDomains.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {settings.blockedDomains.map((domain) => (
                <span
                  key={domain}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-xs rounded-full"
                >
                  <span>{domain}</span>
                  <button
                    onClick={() => handleRemoveBlockedDomain(domain)}
                    className="text-gray-400 hover:text-rose-500 font-bold"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">{t('no_blocked_domains')}</p>
          )}
        </div>

        {/* 3. Storage & Cache (OPFS) */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 border-b pb-2 dark:border-gray-700">
            {t('section_storage')}
          </h2>
          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
            <span>{t('storage_used', [formatMB(storageInfo.usage), formatMB(storageInfo.quota)])}</span>
            <span>{t('storage_task_dirs', [taskDirCount])}</span>
          </div>

          <div className="pt-2">
            <button
              onClick={handleClearOpfs}
              disabled={clearingStorage}
              className="px-3 py-2 text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded hover:bg-rose-100 transition"
            >
              {clearingStorage ? t('clearing_storage') : t('btn_clear_storage')}
            </button>
          </div>
        </div>

        {/* 4. About & Legal (T8.3) */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-3 text-xs">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 border-b pb-2 dark:border-gray-700">
            {t('section_about')}
          </h2>
          <div className="space-y-2 text-gray-600 dark:text-gray-300">
            <div>
              <strong className="block text-gray-900 dark:text-gray-100 mb-0.5">{t('about_title')}</strong>
              <p>{t('about_content')}</p>
            </div>
            <div>
              <strong className="block text-gray-900 dark:text-gray-100 mb-0.5">{t('privacy_title')}</strong>
              <p>{t('privacy_content')}</p>
            </div>
            <div>
              <strong className="block text-gray-900 dark:text-gray-100 mb-0.5">{t('terms_title')}</strong>
              <p>{t('terms_content')}</p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between items-center pt-2">
          <button
            onClick={handleResetDefaults}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline"
          >
            {t('btn_reset_defaults')}
          </button>
          <span className="text-xs text-gray-400">VidGrab v0.1.0</span>
        </div>
      </div>
    </div>
  );
}

function OptionsPage() {
  return (
    <I18nProvider>
      <OptionsContent />
    </I18nProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OptionsPage />
  </React.StrictMode>,
);
