import { describe, expect, it } from 'vitest';
import { AREAS } from './areas';
import { t } from './i18n';

describe('AREAS', () => {
  it('has unique ids and kebab-case paths', () => {
    expect(new Set(AREAS.map((a) => a.id)).size).toBe(AREAS.length);
    for (const a of AREAS) expect(a.path).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
  it('has titles and summaries in every language', () => {
    for (const a of AREAS) for (const lang of ['en', 'zh'] as const) {
      expect(t(lang, a.titleKey)).not.toBe('');
      expect(t(lang, a.summaryKey)).not.toBe('');
    }
  });
  it('starts with fitness only', () => {
    expect(AREAS.map((a) => a.id)).toEqual(['fitness']);
  });
});
