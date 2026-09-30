import { describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS } from './migrate';
import { defaultProfile, PROFILE_VERSION } from './schema';

describe('migrate', () => {
  it('passes a current profile through unchanged', () => {
    const p = defaultProfile('en');
    expect(migrate(p)).toEqual({ ok: true, value: p, from: PROFILE_VERSION });
  });
  it('rejects values that are not profiles', () => {
    for (const raw of [null, 42, 'x', [], {}, { version: 0 }, { version: '1' }, { version: 1.5 }]) {
      expect(migrate(raw), JSON.stringify(raw)).toEqual({ ok: false, error: 'not-profile' });
    }
  });
  it('rejects a profile from a newer version of the site', () => {
    expect(migrate({ version: PROFILE_VERSION + 1 })).toEqual({ ok: false, error: 'newer-version', version: PROFILE_VERSION + 1 });
  });
  it('applies each step in order and stamps the new version', () => {
    const migrations = {
      1: (o: Record<string, unknown>) => ({ ...o, room: { ...(o.room as object), clearanceMarginCm: 12 } }),
      2: (o: Record<string, unknown>) => ({ ...o, renamed: true }),
    };
    const result = migrate({ version: 1, room: {} }, migrations, 3);
    expect(result).toEqual({ ok: true, from: 1, value: { version: 3, room: { clearanceMarginCm: 12 }, renamed: true } });
  });
  it('throws when a step is missing (a developer error)', () => {
    expect(() => migrate({ version: 1 }, {}, 2)).toThrow('No profile migration from version 1');
  });
  it('has a migration for every version below the current one', () => {
    for (let v = 1; v < PROFILE_VERSION; v++) expect(MIGRATIONS[v], `from ${v}`).toBeTypeOf('function');
  });
});
