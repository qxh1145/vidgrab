export interface Settings {
  threads: number;
  autoSave: boolean;
  notify: boolean;
  filenameTemplate: string;
  minSizeKB: number;
  blockedDomains: string[];
  language: 'auto' | 'vi' | 'en';
}

const DEFAULTS: Settings = {
  threads: 6,
  autoSave: true,
  notify: true,
  filenameTemplate: '{title}_{quality}',
  minSizeKB: 200,
  blockedDomains: [],
  language: 'auto',
};

const STORAGE_KEY = 'settings';

/**
 * Merge saved partial settings with defaults. Exported for testing.
 */
export function mergeDefaults(partial: Partial<Settings>): Settings {
  return { ...DEFAULTS, ...partial };
}

export async function getSettings(): Promise<Settings> {
  const data = await browser.storage.sync.get(STORAGE_KEY);
  const saved: Partial<Settings> = (data[STORAGE_KEY] as Partial<Settings>) ?? {};
  return mergeDefaults(saved);
}

export async function setSettings(
  patch: Partial<Settings>,
): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await browser.storage.sync.set({ [STORAGE_KEY]: next });
  return next;
}

export function onSettingsChanged(
  cb: (next: Settings, prev: Settings) => void,
): () => void {
  const listener = (
    changes: Record<string, Browser.storage.StorageChange>,
    area: string,
  ) => {
    if (area === 'sync' && changes[STORAGE_KEY]) {
      const prev = mergeDefaults(
        (changes[STORAGE_KEY].oldValue as Partial<Settings>) ?? {},
      );
      const next = mergeDefaults(
        (changes[STORAGE_KEY].newValue as Partial<Settings>) ?? {},
      );
      cb(next, prev);
    }
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
