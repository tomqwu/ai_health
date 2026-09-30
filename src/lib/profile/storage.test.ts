import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile, type Profile } from './schema';
import { BACKUP_PREFIX, browserStorage, MemoryStorage, openProfileStore, PROFILE_KEY, ProfileStore } from './storage';

const NOW = 1_790_000_000_000;
const synthetic = (): Profile => ({ ...defaultProfile('en'), statureCm: 181, room: { ceilingHeightCm: 243.84, clearanceMarginCm: 10 } }); // 8 ft ceiling

afterEach(() => vi.unstubAllGlobals());

describe('ProfileStore', () => {
  it('reports an empty store', () => {
    expect(new ProfileStore(new MemoryStorage()).load()).toEqual({ status: 'empty' });
  });

  it('saves and loads under aih.profile', () => {
    const storage = new MemoryStorage();
    const store = new ProfileStore(storage);
    store.save(synthetic());
    expect(storage.keys()).toEqual([PROFILE_KEY]);
    expect(store.load()).toEqual({ status: 'ok', profile: synthetic() });
  });

  it('refuses to save an invalid profile', () => {
    const store = new ProfileStore(new MemoryStorage());
    expect(() => store.save({ ...synthetic(), statureCm: 5 })).toThrow();
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

  it('leaves the original in place when the backup cannot be written', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, '{broken');
    const full = { getItem: (k: string) => storage.getItem(k), removeItem: (k: string) => storage.removeItem(k), setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(new ProfileStore(full).load()).toMatchObject({ status: 'corrupt', backupKey: null });
    expect(storage.getItem(PROFILE_KEY)).toBe('{broken');
  });

  it('clear() removes the profile', () => {
    const store = new ProfileStore(new MemoryStorage());
    store.save(synthetic());
    store.clear();
    expect(store.load()).toEqual({ status: 'empty' });
  });

  it('runs in memory without storage', () => {
    const store = new ProfileStore(null);
    expect(store.persistent).toBe(false);
    store.save(synthetic());
    expect(store.load()).toEqual({ status: 'ok', profile: synthetic() });
  });
});

describe('browserStorage', () => {
  it('returns null when localStorage is missing', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(browserStorage()).toBeNull();
    expect(openProfileStore().persistent).toBe(false);
  });
  it('returns null when localStorage throws on write', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, removeItem: () => {}, setItem: () => { throw new Error('SecurityError'); } });
    expect(browserStorage()).toBeNull();
  });
  it('returns a working localStorage', () => {
    const mem = new MemoryStorage();
    vi.stubGlobal('localStorage', mem);
    expect(browserStorage()).toBe(mem);
    expect(openProfileStore().persistent).toBe(true);
    expect(mem.keys()).toEqual([]);
  });
});
