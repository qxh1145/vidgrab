import { describe, it, expect } from 'vitest';
import { t, resolveLanguage } from '../shared/i18n';
import viMessages from '../public/_locales/vi/messages.json';
import enMessages from '../public/_locales/en/messages.json';

describe('i18n module', () => {
  it('resolves explicit languages correctly', () => {
    expect(resolveLanguage('vi')).toBe('vi');
    expect(resolveLanguage('en')).toBe('en');
  });

  it('translates simple keys', () => {
    expect(t('extName', undefined, 'en')).toBe('VidGrab');
    expect(t('extName', undefined, 'vi')).toBe('VidGrab');
    expect(t('btn_download', undefined, 'vi')).toBe('Tải');
    expect(t('btn_download', undefined, 'en')).toBe('Download');
  });

  it('handles positional array substitutions', () => {
    const viResult = t('save_failed', ['Network Error'], 'vi');
    expect(viResult).toContain('Network Error');
    expect(viResult).toContain('Lưu file thất bại');

    const enResult = t('save_failed', ['Network Error'], 'en');
    expect(enResult).toContain('Network Error');
    expect(enResult).toContain('Failed to save file');
  });

  it('handles object substitutions', () => {
    const customResult = t('merging_status', { percent: 75 }, 'en');
    expect(customResult).toContain('75%');
  });

  it('ensures locale parity between vi and en messages.json', () => {
    const viKeys = Object.keys(viMessages).sort();
    const enKeys = Object.keys(enMessages).sort();

    expect(viKeys).toEqual(enKeys);
    expect(viKeys.length).toBeGreaterThan(30);
  });
});
