import type { z } from 'zod';
import type { Message } from '../i18n/format';
import { migrate } from './migrate';
import { type Profile, PROFILE_VERSION, ProfileSchema } from './schema';

/** One problem, located by a dotted path ("room.ceilingHeightCm"); "" = the whole file. */
export interface FieldError {
  path: string;
  message: Message;
}

export type ParseResult = { ok: true; profile: Profile; migratedFrom?: number } | { ok: false; errors: FieldError[] };

function issueMessage(issue: z.core.$ZodIssue): Message {
  // Parsed with reportInput: an undefined input means the field was absent (JSON has no undefined).
  const absent = issue.input === undefined;
  switch (issue.code) {
    case 'invalid_type':
      return { key: absent ? 'profile.error.required' : 'profile.error.type' };
    case 'invalid_value':
      return { key: absent ? 'profile.error.required' : 'profile.error.choice' };
    case 'too_small':
    case 'too_big':
      return { key: 'profile.error.range' };
    case 'unrecognized_keys':
      return { key: 'profile.error.unknownField', params: { field: issue.keys.join(', ') } };
    default:
      return { key: 'profile.error.invalid' };
  }
}

/** Migrate and validate a stored or imported value. Errors are localizable, field by field. */
export function parseProfile(raw: unknown): ParseResult {
  const migrated = migrate(raw);
  if (!migrated.ok) {
    const message: Message =
      migrated.error === 'newer-version'
        ? { key: 'profile.error.newerVersion', params: { version: migrated.version } }
        : { key: 'profile.error.notProfile' };
    return { ok: false, errors: [{ path: '', message }] };
  }
  const parsed = ProfileSchema.safeParse(migrated.value, { reportInput: true });
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: issueMessage(i) })) };
  }
  return migrated.from === PROFILE_VERSION
    ? { ok: true, profile: parsed.data }
    : { ok: true, profile: parsed.data, migratedFrom: migrated.from };
}
