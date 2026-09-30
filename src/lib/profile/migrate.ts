import { PROFILE_VERSION } from './schema';

type Raw = Record<string, unknown>;

/** Turns a profile of version n into version n + 1. */
export type Migration = (old: Raw) => Raw;

/**
 * Keyed by the version they migrate FROM. Every schema change bumps PROFILE_VERSION and adds an
 * entry here with a test (spec §6, §11). Version 1 is the first version, so there are none yet.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export type MigrateResult =
  | { ok: true; value: Raw; from: number }
  | { ok: false; error: 'not-profile' }
  | { ok: false; error: 'newer-version'; version: number };

const isRaw = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Bring a stored or imported value up to the current version. Validation happens afterwards. */
export function migrate(raw: unknown, migrations: Readonly<Record<number, Migration>> = MIGRATIONS, current = PROFILE_VERSION): MigrateResult {
  if (!isRaw(raw)) return { ok: false, error: 'not-profile' };
  const from = raw.version;
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 1) return { ok: false, error: 'not-profile' };
  if (from > current) return { ok: false, error: 'newer-version', version: from };
  let value = raw;
  for (let v = from; v < current; v++) {
    const step = migrations[v];
    if (!step) throw new Error(`No profile migration from version ${v}`);
    value = { ...step(value), version: v + 1 };
  }
  return { ok: true, value, from };
}
