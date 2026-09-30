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

/** localStorage if it exists and accepts writes (private modes may throw), else null. */
export function browserStorage(): KeyValueStorage | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = 'aih.__probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
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
 * nothing here ever sends data anywhere.
 */
export class ProfileStore {
  /** False when changes live only in memory (the planner shows a "won't be saved" banner). */
  readonly persistent: boolean;
  private readonly storage: KeyValueStorage;

  constructor(storage: KeyValueStorage | null, private readonly now: () => number = Date.now) {
    this.persistent = storage !== null;
    this.storage = storage ?? new MemoryStorage();
  }

  load(): LoadResult {
    const text = this.storage.getItem(PROFILE_KEY);
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
    this.save(parsed.profile);
    return { status: 'ok', profile: parsed.profile, migratedFrom: parsed.migratedFrom };
  }

  /** Validates, then writes. Throws on an invalid profile (a developer error). */
  save(profile: Profile): void {
    this.storage.setItem(PROFILE_KEY, JSON.stringify(ProfileSchema.parse(profile)));
  }

  /** "Reset data": removes the profile (backups stay until the user clears site data). */
  clear(): void {
    this.storage.removeItem(PROFILE_KEY);
  }

  private quarantine(text: string, errors: FieldError[]): LoadResult {
    const backupKey = `${BACKUP_PREFIX}${this.now()}`;
    try {
      this.storage.setItem(backupKey, text);
    } catch {
      return { status: 'corrupt', backupKey: null, errors };
    }
    this.storage.removeItem(PROFILE_KEY);
    return { status: 'corrupt', backupKey, errors };
  }
}

/** The store the site uses: localStorage when available, otherwise memory only. */
export function openProfileStore(): ProfileStore {
  return new ProfileStore(browserStorage());
}
