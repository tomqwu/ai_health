import { describe, expect, it } from 'vitest';
import { formatMessage } from '../i18n/format';
import { defaultProfile, type Profile } from './schema';
import { exportFileName, exportProfile, importProfile } from './transfer';

const synthetic = (): Profile => ({
  ...defaultProfile('zh'),
  statureCm: 168,
  room: { ceilingHeightCm: 243.84, clearanceMarginCm: 10 }, // a standard 8 ft ceiling
  equipment: [{ id: 'dumbbells', params: { dumbbellLoads: { unit: 'kg', loads: [2, 4, 6, 8, 10] } } }],
});

describe('export / import', () => {
  it('round-trips a profile exactly', () => {
    const p = synthetic();
    const result = importProfile(exportProfile(p));
    expect(result).toEqual({ ok: true, profile: p });
  });
  it('names the file by local date', () => {
    expect(exportFileName(new Date(2026, 8, 30, 23, 59))).toBe('aih-profile-2026-09-30.json');
  });
  it('rejects text that is not JSON', () => {
    expect(importProfile('{oops')).toEqual({ ok: false, errors: [{ path: '', message: { key: 'profile.error.notJson' } }] });
  });
  it('rejects JSON that is not a profile', () => {
    expect(importProfile('[1,2]')).toEqual({ ok: false, errors: [{ path: '', message: { key: 'profile.error.notProfile' } }] });
  });
  it('rejects a newer profile version', () => {
    const r = importProfile(JSON.stringify({ ...synthetic(), version: 9 }));
    expect(r).toEqual({ ok: false, errors: [{ path: '', message: { key: 'profile.error.newerVersion', params: { version: 9 } } }] });
  });
  it('reports field-level errors', () => {
    const bad = { ...synthetic(), statureCm: 20, locale: 'fr', name: 'A', room: { clearanceMarginCm: 10 }, units: { length: 'cm' } };
    const r = importProfile(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual(
      expect.arrayContaining([
        { path: 'statureCm', message: { key: 'profile.error.range' } },
        { path: 'locale', message: { key: 'profile.error.choice' } },
        { path: 'units.mass', message: { key: 'profile.error.required' } },
        { path: '', message: { key: 'profile.error.unknownField', params: { field: 'name' } } },
      ]),
    );
  });
  it('reports wrong value types', () => {
    const r = importProfile(JSON.stringify({ ...synthetic(), statureCm: '168' }));
    expect(r).toEqual({ ok: false, errors: [{ path: 'statureCm', message: { key: 'profile.error.type' } }] });
  });
  it('produces errors that read in both languages', () => {
    const r = importProfile(JSON.stringify({ ...synthetic(), statureCm: 20 }));
    if (r.ok) throw new Error('expected an error');
    expect(formatMessage('en', r.errors[0]!.message)).toBe('Outside the allowed range');
    expect(formatMessage('zh', r.errors[0]!.message)).toBe('超出允许范围');
  });
});
