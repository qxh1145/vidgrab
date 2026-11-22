import { describe, it, expect } from 'vitest';
import { mergeDefaults, type Settings } from '../shared/settings';

describe('mergeDefaults', () => {
  it('returns full defaults when given empty object', () => {
    const result = mergeDefaults({});
    expect(result).toEqual({
      threads: 6,
      autoSave: true,
      notify: true,
      filenameTemplate: '{title}_{quality}',
      minSizeKB: 200,
      blockedDomains: [],
      language: 'auto',
    });
  });

  it('overrides only provided fields', () => {
    const result = mergeDefaults({ threads: 3, language: 'vi' });
    expect(result.threads).toBe(3);
    expect(result.language).toBe('vi');
    // rest stays default
    expect(result.autoSave).toBe(true);
    expect(result.filenameTemplate).toBe('{title}_{quality}');
  });

  it('preserves false-y overrides (autoSave=false, minSizeKB=0)', () => {
    const result = mergeDefaults({ autoSave: false, minSizeKB: 0 });
    expect(result.autoSave).toBe(false);
    expect(result.minSizeKB).toBe(0);
  });

  it('keeps blockedDomains from saved value', () => {
    const result = mergeDefaults({ blockedDomains: ['example.com'] });
    expect(result.blockedDomains).toEqual(['example.com']);
  });

  it('result satisfies Settings type', () => {
    const result: Settings = mergeDefaults({});
    expect(typeof result.threads).toBe('number');
    expect(typeof result.autoSave).toBe('boolean');
    expect(typeof result.filenameTemplate).toBe('string');
    expect(Array.isArray(result.blockedDomains)).toBe(true);
  });
});
