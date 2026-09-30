import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseProfile } from './parse';
import { defaultProfile, type Profile } from './schema';
import { BACKUP_PREFIX, browserStorage, type KeyValueStorage, MemoryStorage, openProfileStore, PROFILE_KEY, ProfileStore } from './storage';

// Pass-through by default; one test swaps in a result that reports a migration (version 1 has none yet).
vi.mock('./parse', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./parse')>();
  return { ...actual, parseProfile: vi.fn(actual.parseProfile) };
});

const NOW = 1_790_000_000_000;
const synthetic = (): Profile => ({ ...defaultProfile('en'), statureCm: 181, room: { ceilingHeightCm: 243.84, clearanceMarginCm: 10 } }); // 8 ft ceiling

const quota = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');
const blocked = () => new DOMException('The operation is insecure.', 'SecurityError');

/** Wraps `inner`, making the named operations throw. */
function failing(inner: KeyValueStorage, fail: { get?: boolean; set?: boolean; remove?: boolean }): KeyValueStorage {
  return {
    getItem: (k) => {
      if (fail.get) throw blocked();
      return inner.getItem(k);
    },
    setItem: (k, v) => {
      if (fail.set) throw quota();
      inner.setItem(k, v);
    },
    removeItem: (k) => {
      if (fail.remove) throw blocked();
      inner.removeItem(k);
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('ProfileStore', () => {
  it('reports an empty store', () => {
    expect(new ProfileStore(new MemoryStorage()).load()).toEqual({ status: 'empty' });
  });

  it('saves and loads under aih.profile', () => {
    const storage = new MemoryStorage();
    const store = new ProfileStore(storage);
    expect(store.save(synthetic())).toBe(true);
    expect(storage.keys()).toEqual([PROFILE_KEY]);
    expect(store.load()).toEqual({ status: 'ok', profile: synthetic() });
  });

  it('refuses to save an invalid profile', () => {
    const store = new ProfileStore(new MemoryStorage());
    expect(() => store.save({ ...synthetic(), statureCm: 5 })).toThrow();
  });

  it('refuses an invalid profile even when storage is failing', () => {
    const store = new ProfileStore(failing(new MemoryStorage(), { set: true }));
    expect(() => store.save({ ...synthetic(), statureCm: 5 })).toThrow();
    expect(store.persistent).toBe(true);
  });

  it('moves an invalid profile to a timestamped backup and keeps working', () => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify({ ...synthetic(), statureCm: 'tall' });
    storage.setItem(PROFILE_KEY, raw);
    const result = new ProfileStore(storage, () => NOW).load();
    expect(result).toEqual({
      status: 'corrupt',
      backupKey: `${BACKUP_PREFIX}${NOW}`,
      errors: [{ path: 'statureCm', message: { key: 'profile.error.type' } }],
    });
    expect(storage.getItem(`${BACKUP_PREFIX}${NOW}`)).toBe(raw);
    expect(storage.getItem(PROFILE_KEY)).toBeNull();
  });

  it('backs up text that is not JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, '{broken');
    const result = new ProfileStore(storage, () => NOW).load();
    expect(result).toMatchObject({ status: 'corrupt', errors: [{ path: '', message: { key: 'profile.error.notJson' } }] });
    expect(storage.getItem(`${BACKUP_PREFIX}${NOW}`)).toBe('{broken');
  });

  it('never overwrites an earlier backup made in the same millisecond', () => {
    const storage = new MemoryStorage();
    storage.setItem(`${BACKUP_PREFIX}${NOW}`, 'first');
    storage.setItem(PROFILE_KEY, '{second');
    expect(new ProfileStore(storage, () => NOW).load()).toMatchObject({ status: 'corrupt', backupKey: `${BACKUP_PREFIX}${NOW}-1` });
    expect(storage.getItem(`${BACKUP_PREFIX}${NOW}`)).toBe('first');
    expect(storage.getItem(`${BACKUP_PREFIX}${NOW}-1`)).toBe('{second');
  });

  it('leaves the original in place when the backup cannot be written', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, '{broken');
    const store = new ProfileStore(failing(storage, { set: true }));
    expect(store.load()).toMatchObject({ status: 'corrupt', backupKey: null });
    expect(storage.getItem(PROFILE_KEY)).toBe('{broken');
    expect(storage.keys()).toEqual([PROFILE_KEY]);
  });

  it('never overwrites a corrupt original that has no backup', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, '{broken');
    let full = true;
    const flaky: KeyValueStorage = {
      getItem: (k) => storage.getItem(k),
      removeItem: (k) => storage.removeItem(k),
      setItem: (k, v) => {
        if (full) throw quota();
        storage.setItem(k, v);
      },
    };
    const store = new ProfileStore(flaky);
    expect(store.load()).toMatchObject({ status: 'corrupt', backupKey: null });
    expect(store.persistent).toBe(false);
    full = false; // space frees up later in the session
    expect(store.save(synthetic())).toBe(false);
    store.clear();
    expect(storage.getItem(PROFILE_KEY)).toBe('{broken');
    expect(storage.keys()).toEqual([PROFILE_KEY]);
  });

  it('keeps the backup and switches to memory when the original cannot be removed', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, '{broken');
    const store = new ProfileStore(failing(storage, { remove: true }), () => NOW);
    expect(store.load()).toMatchObject({ status: 'corrupt', backupKey: `${BACKUP_PREFIX}${NOW}` });
    expect(storage.getItem(`${BACKUP_PREFIX}${NOW}`)).toBe('{broken');
    expect(store.persistent).toBe(false);
    expect(store.load()).toEqual({ status: 'empty' });
  });

  it('keeps a profile in memory when a save hits the quota', () => {
    const storage = new MemoryStorage();
    const store = new ProfileStore(failing(storage, { set: true }));
    expect(store.persistent).toBe(true);
    expect(store.save(synthetic())).toBe(false);
    expect(store.persistent).toBe(false);
    expect(store.load()).toEqual({ status: 'ok', profile: synthetic() });
    expect(storage.keys()).toEqual([]);
  });

  it('returns a migrated profile when the re-save hits the quota', () => {
    const storage = new MemoryStorage();
    const older = JSON.stringify({ ...synthetic(), version: 0 });
    storage.setItem(PROFILE_KEY, older);
    vi.mocked(parseProfile).mockReturnValueOnce({ ok: true, profile: synthetic(), migratedFrom: 0 });
    const store = new ProfileStore(failing(storage, { set: true }));
    expect(store.load()).toEqual({ status: 'ok', profile: synthetic(), migratedFrom: 0 });
    expect(store.persistent).toBe(false);
    expect(storage.getItem(PROFILE_KEY)).toBe(older);
    expect(store.load()).toEqual({ status: 'ok', profile: synthetic() });
  });

  it('re-saves a migrated profile when storage works', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, JSON.stringify({ ...synthetic(), version: 0 }));
    vi.mocked(parseProfile).mockReturnValueOnce({ ok: true, profile: synthetic(), migratedFrom: 0 });
    const store = new ProfileStore(storage);
    expect(store.load()).toEqual({ status: 'ok', profile: synthetic(), migratedFrom: 0 });
    expect(store.persistent).toBe(true);
    expect(JSON.parse(storage.getItem(PROFILE_KEY) ?? '')).toEqual(synthetic());
  });

  it('switches to memory instead of throwing when getItem throws', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, JSON.stringify(synthetic()));
    const store = new ProfileStore(failing(storage, { get: true }));
    expect(store.load()).toEqual({ status: 'empty' });
    expect(store.persistent).toBe(false);
    const changed = { ...synthetic(), statureCm: 170 };
    expect(store.save(changed)).toBe(false);
    expect(store.load()).toEqual({ status: 'ok', profile: changed });
    expect(JSON.parse(storage.getItem(PROFILE_KEY) ?? '')).toEqual(synthetic());
  });

  it('switches to memory instead of throwing when removeItem throws', () => {
    const storage = new MemoryStorage();
    const store = new ProfileStore(failing(storage, { remove: true }));
    expect(store.save(synthetic())).toBe(true);
    expect(store.clear()).toBe(false);
    expect(store.persistent).toBe(false);
    expect(store.load()).toEqual({ status: 'empty' });
  });

  it('clear() removes the profile', () => {
    const store = new ProfileStore(new MemoryStorage());
    store.save(synthetic());
    expect(store.clear()).toBe(true);
    expect(store.load()).toEqual({ status: 'empty' });
  });

  it('runs in memory without storage', () => {
    const store = new ProfileStore(null);
    expect(store.persistent).toBe(false);
    expect(store.save(synthetic())).toBe(false);
    expect(store.load()).toEqual({ status: 'ok', profile: synthetic() });
  });
});

describe('browserStorage', () => {
  it('returns null when localStorage is missing', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(browserStorage()).toBeNull();
    expect(openProfileStore().persistent).toBe(false);
  });
  it('returns null when the localStorage accessor throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw blocked();
      },
    });
    try {
      expect(browserStorage()).toBeNull();
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
  it('returns null when getItem throws', () => {
    vi.stubGlobal('localStorage', failing(new MemoryStorage(), { get: true }));
    expect(browserStorage()).toBeNull();
  });
  it('still reads a saved profile when every write fails (full quota)', () => {
    const mem = new MemoryStorage();
    mem.setItem(PROFILE_KEY, JSON.stringify(synthetic()));
    const full = failing(mem, { set: true });
    vi.stubGlobal('localStorage', full);
    expect(browserStorage()).toBe(full);
    const store = openProfileStore();
    expect(store.persistent).toBe(true);
    expect(store.load()).toEqual({ status: 'ok', profile: synthetic() });
  });
  it('returns a working localStorage without writing to it', () => {
    const mem = new MemoryStorage();
    vi.stubGlobal('localStorage', mem);
    expect(browserStorage()).toBe(mem);
    expect(openProfileStore().persistent).toBe(true);
    expect(mem.keys()).toEqual([]);
  });
});
