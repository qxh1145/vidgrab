import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSettings, onSettingsChanged } from './settings';
import viMessages from '../public/_locales/vi/messages.json';
import enMessages from '../public/_locales/en/messages.json';

export type Language = 'auto' | 'vi' | 'en';
export type ResolvedLanguage = 'vi' | 'en';

type MessageEntry = { message: string; description?: string; placeholders?: Record<string, { content: string }> };
type LocaleDict = Record<string, MessageEntry>;

const DICTIONARIES: Record<ResolvedLanguage, LocaleDict> = {
  vi: viMessages as LocaleDict,
  en: enMessages as LocaleDict,
};

let currentLanguage: ResolvedLanguage = 'vi';

export function resolveLanguage(pref: Language): ResolvedLanguage {
  if (pref === 'vi' || pref === 'en') return pref;

  // 'auto': check browser.i18n or navigator
  try {
    const b = (globalThis as unknown as { browser?: { i18n?: { getUILanguage?: () => string } } }).browser;
    if (b?.i18n?.getUILanguage) {
      const uiLang = b.i18n.getUILanguage().toLowerCase();
      if (uiLang.startsWith('vi')) return 'vi';
      return 'en';
    }
  } catch {
    // fallback to navigator
  }

  if (typeof navigator !== 'undefined') {
    const navLang = (navigator.language || '').toLowerCase();
    if (navLang.startsWith('vi')) return 'vi';
  }

  return 'en';
}

/**
 * Initialize language setting once.
 */
export async function initI18n(): Promise<ResolvedLanguage> {
  try {
    const s = await getSettings();
    currentLanguage = resolveLanguage(s.language);
  } catch {
    currentLanguage = resolveLanguage('auto');
  }
  return currentLanguage;
}

// Initial resolution
if (typeof window !== 'undefined') {
  void initI18n();
}

/**
 * Translates a key using the given language (or active resolved language).
 * Handles placeholders in formats:
 * - array substitutions: $1, $2 or {0}, {1}
 * - object substitutions: {name}, {count}
 */
export function t(
  key: string,
  substitutions?: Record<string, string | number> | (string | number)[],
  langOverride?: ResolvedLanguage,
): string {
  const lang = langOverride || currentLanguage;
  const dict = DICTIONARIES[lang] || DICTIONARIES.vi;
  const entry = dict[key] || DICTIONARIES.en[key] || DICTIONARIES.vi[key];

  let raw = entry?.message;

  // Fallback to browser.i18n if available and message not found
  if (!raw) {
    try {
      const b = (globalThis as unknown as { browser?: { i18n?: { getMessage?: (key: string) => string } } }).browser;
      if (b?.i18n?.getMessage) {
        raw = b.i18n.getMessage(key);
      }
    } catch {
      // ignore
    }
  }

  if (!raw) return key;

  if (!substitutions) return raw;

  if (Array.isArray(substitutions)) {
    // Replace $1, $2, $3 or $KEY$
    let replaced = raw;
    substitutions.forEach((sub, idx) => {
      const numPattern = new RegExp(`\\$${idx + 1}\\$|\\$${idx + 1}|\\{${idx}\\}`, 'g');
      replaced = replaced.replace(numPattern, String(sub));
    });

    // Also replace placeholders defined in manifest format like $PERCENT$, $DONE$, $TOTAL$ in order
    if (entry?.placeholders) {
      const pKeys = Object.keys(entry.placeholders);
      pKeys.forEach((pk, idx) => {
        if (substitutions[idx] !== undefined) {
          const phPattern = new RegExp(`\\$${pk.toUpperCase()}\\$|\\{${pk}\\}`, 'gi');
          replaced = replaced.replace(phPattern, String(substitutions[idx]));
        }
      });
    }

    return replaced;
  }

  // Object substitutions {key: value}
  let replaced = raw;
  for (const [k, v] of Object.entries(substitutions)) {
    const pat = new RegExp(`\\{${k}\\}|\\$${k.toUpperCase()}\\$`, 'gi');
    replaced = replaced.replace(pat, String(v));
  }
  return replaced;
}

interface I18nContextValue {
  t: (key: string, substitutions?: Record<string, string | number> | (string | number)[]) => string;
  lang: ResolvedLanguage;
  setLanguage: (pref: Language) => void;
}

const I18nContext = createContext<I18nContextValue>({
  t: (k, s) => t(k, s, currentLanguage),
  lang: currentLanguage,
  setLanguage: () => {},
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<ResolvedLanguage>(currentLanguage);

  useEffect(() => {
    void getSettings().then((s) => {
      const resolved = resolveLanguage(s.language);
      currentLanguage = resolved;
      setLang(resolved);
    });

    const unsubscribe = onSettingsChanged((newSettings) => {
      const resolved = resolveLanguage(newSettings.language);
      currentLanguage = resolved;
      setLang(resolved);
    });

    return unsubscribe;
  }, []);

  const value: I18nContextValue = {
    t: (key, substitutions) => t(key, substitutions, lang),
    lang,
    setLanguage: (pref: Language) => {
      const resolved = resolveLanguage(pref);
      currentLanguage = resolved;
      setLang(resolved);
    },
  };

  return React.createElement(I18nContext.Provider, { value }, children);
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
