/** The browser-only profile (spec §6). Only storage.ts touches localStorage. */
export { MIGRATIONS, migrate } from './migrate';
export { type FieldError, parseProfile } from './parse';
export { defaultProfile, PROFILE_VERSION, type Profile, ProfileSchema } from './schema';
export { BACKUP_PREFIX, browserStorage, type KeyValueStorage, type LoadResult, MemoryStorage, openProfileStore, PROFILE_KEY, ProfileStore } from './storage';
export { exportFileName, exportProfile, importProfile } from './transfer';
