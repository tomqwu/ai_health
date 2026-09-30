import { type ParseResult, parseProfile } from './parse';
import type { Profile } from './schema';

/** JSON export (spec §6). The file holds exactly the profile, nothing else. */
export function exportProfile(profile: Profile): string {
  return `${JSON.stringify(profile, null, 2)}\n`;
}

/** e.g. "aih-profile-2026-09-30.json" (local date). */
export function exportFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `aih-profile-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/** Validate an import file before anything is overwritten (spec §11). */
export function importProfile(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: [{ path: '', message: { key: 'profile.error.notJson' } }] };
  }
  return parseProfile(raw);
}
