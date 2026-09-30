import { type FieldError, parseProfile } from './parse';
import { type Profile, ProfileSchema } from './schema';

/** Spec §6. */
export const PROFILE_KEY = 'aih.profile';
/** Spec §11: a profile that fails validation is kept under this prefix + a timestamp. */
export const BACKUP_PREFIX = 'aih.profile.backup.';

/** The subset of the Web Storage API this module uses. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory storage for when localStorage is unavailable (and for tests). */
export class MemoryStorage implements KeyValueStorage {
  private readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  keys(): string[] {
    return [...this.items.keys()];
  }
}

/**
 * localStorage if it can be read, else null. Accessing `localStorage` or calling `getItem` throws
 * in private or blocked-cookie modes. The check is read-only on purpose: a full quota must not hide
 * a saved profile, and write failures are handled by ProfileStore at the time they happen.
 */
export function browserStorage(): KeyValueStorage | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    s.getItem(PROFILE_KEY);
    return s;
  } catch {
    return null;
  }
}

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; profile: Profile; migratedFrom?: number }
  /** The raw text was moved to `backupKey` (null if even that failed); the site keeps working. */
  | { status: 'corrupt'; backupKey: string | null; errors: FieldError[] };

/**
 * The only code that touches browser storage (spec §4.2). Every read goes through the schema;
 * nothing here ever sends data anywhere. Storage errors (quota, SecurityError) never reach the
 * caller: the first one switches the store to memory for the rest of the session, so it keeps
 * working and never writes over data it could not back up.
 */
export class ProfileStore {
  private storage: KeyValueStorage;
  private durable: boolean;

  constructor(storage: KeyValueStorage | null, private readonly now: () => number = Date.now) {
    this.durable = storage !== null;
    this.storage = storage ?? new MemoryStorage();
  }

  /**
   * False when changes live only in memory (the planner shows a "won't be saved" banner): there is
   * no storage, or a storage call failed earlier in the session. Once false, it stays false.
   */
  get persistent(): boolean {
    return this.durable;
  }

  /** Never throws. If storage cannot be read, the store switches to memory and reports `empty`. */
  load(): LoadResult {
    const text = this.read(PROFILE_KEY);
    if (text === null) return { status: 'empty' };
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return this.quarantine(text, [{ path: '', message: { key: 'profile.error.notJson' } }]);
    }
    const parsed = parseProfile(raw);
    if (!parsed.ok) return this.quarantine(text, parsed.errors);
    if (parsed.migratedFrom === undefined) return { status: 'ok', profile: parsed.profile };
    // Best effort: if the re-save fails, the store switches to memory and the old text stays as it is.
    this.save(parsed.profile);
    return { status: 'ok', profile: parsed.profile, migratedFrom: parsed.migratedFrom };
  }

  /**
   * Validates, then writes. Returns true when the profile reached persistent storage and false when
   * it is kept in memory only (no storage, or the write failed, e.g. quota). Throws only on an
   * invalid profile (a developer error), never because of storage.
   */
  save(profile: Profile): boolean {
    const text = JSON.stringify(ProfileSchema.parse(profile));
    if (this.write(PROFILE_KEY, text)) return this.durable;
    this.storage.setItem(PROFILE_KEY, text); // the memory copy after the fallback
    return false;
  }

  /**
   * "Reset data": removes the profile (backups stay until the user clears site data). Returns
   * whether the removal reached persistent storage; on failure the store switches to memory.
   */
  clear(): boolean {
    return this.remove(PROFILE_KEY) && this.durable;
  }

  /**
   * Owner decision 16: back up the raw text, then remove it. The original is removed only after a
   * successful backup. If the backup fails, the store switches to memory, so no later save() can
   * overwrite the only copy.
   */
  private quarantine(text: string, errors: FieldError[]): LoadResult {
    const backupKey = this.freeBackupKey();
    if (backupKey === null || !this.write(backupKey, text)) return { status: 'corrupt', backupKey: null, errors };
    this.remove(PROFILE_KEY); // a failure leaves both copies and switches to memory
    return { status: 'corrupt', backupKey, errors };
  }

  /** `aih.profile.backup.<timestamp>`, with `-1`, `-2`… if that key is taken (same millisecond). */
  private freeBackupKey(): string | null {
    const base = `${BACKUP_PREFIX}${this.now()}`;
    for (let n = 0; ; n++) {
      const key = n === 0 ? base : `${base}-${n}`;
      try {
        if (this.storage.getItem(key) === null) return key;
      } catch {
        this.fallBackToMemory();
        return null;
      }
    }
  }

  private read(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      this.fallBackToMemory();
      return null;
    }
  }

  private write(key: string, value: string): boolean {
    try {
      this.storage.setItem(key, value);
      return true;
    } catch {
      this.fallBackToMemory();
      return false;
    }
  }

  private remove(key: string): boolean {
    try {
      this.storage.removeItem(key);
      return true;
    } catch {
      this.fallBackToMemory();
      return false;
    }
  }

  /** From now on nothing touches persistent storage, so data left there stays exactly as it is. */
  private fallBackToMemory(): void {
    this.storage = new MemoryStorage();
    this.durable = false;
  }
}

/**
 * The store the site uses: localStorage when available, otherwise memory only. Open it once and
 * share it: in memory mode each call gets its own empty store.
 */
export function openProfileStore(): ProfileStore {
  return new ProfileStore(browserStorage());
}
