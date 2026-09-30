import { z } from 'zod';
import { IdSchema, ParamNameSchema } from '../content/common';
import { ParamValueSchema } from '../content/params';
import { LIMITATIONS, WEEKDAYS } from '../content/vocab';
import { LOCALES, type Locale } from '../i18n/locales';

/** Bump on every schema change and add a migration (spec §6). */
export const PROFILE_VERSION = 1;
export const DEFAULT_CLEARANCE_MARGIN_CM = 10;
export const DEFAULT_TEMPLATE_ID = 'split-6day-push-legs-core-pull-full-mobility';
export const DEFAULT_SESSION_MINUTES = 35;

/** "mon/0" = Monday, first slot. */
export const SLOT_KEY = new RegExp(`^(${WEEKDAYS.join('|')})/\\d+$`);

/** The issue message a list with a repeated entry reports; `parseProfile` turns it into `profile.error.duplicate`. */
export const DUPLICATE_ISSUE = 'duplicate';
const unique = (list: readonly unknown[]) => new Set(list).size === list.length;

/**
 * The visitor's profile (spec §6). Lives only in the browser. Stored lengths are centimetres; `units`
 * affects display only. Objects are strict, so nothing beyond these fields (no name, age, weight or
 * health notes) can be stored or imported.
 */
export const ProfileSchema = z.strictObject({
  version: z.literal(PROFILE_VERSION),
  locale: z.enum(LOCALES),
  units: z.strictObject({ length: z.enum(['cm', 'in']), mass: z.enum(['kg', 'lb']) }),
  statureCm: z.number().min(100).max(250).optional(),
  room: z.strictObject({
    ceilingHeightCm: z.number().min(150).max(600).optional(),
    clearanceMarginCm: z.number().min(0).max(50).default(DEFAULT_CLEARANCE_MARGIN_CM),
  }),
  equipment: z
    .array(z.strictObject({ id: IdSchema, params: z.record(ParamNameSchema, ParamValueSchema).default({}) }))
    .refine((list) => unique(list.map((e) => e.id)), { message: DUPLICATE_ISSUE }),
  // Each entry once: the engine iterates these lists, so a repeat would count twice (e.g. a doubled safety note).
  attachments: z.array(IdSchema).refine(unique, { message: DUPLICATE_ISSUE }),
  exclusions: z.array(IdSchema).refine(unique, { message: DUPLICATE_ISSUE }),
  limitations: z.array(z.enum(LIMITATIONS)).refine(unique, { message: DUPLICATE_ISSUE }),
  schedule: z.strictObject({
    templateId: IdSchema,
    sessionMinutes: z.number().int().min(10).max(180),
    overrides: z.record(z.string().regex(SLOT_KEY), IdSchema),
  }),
});
export type Profile = z.output<typeof ProfileSchema>;

/** A fresh profile: nothing owned or entered yet (the engine then uses typical values, D12), metric display. */
export function defaultProfile(locale: Locale): Profile {
  return {
    version: PROFILE_VERSION,
    locale,
    units: { length: 'cm', mass: 'kg' },
    room: { clearanceMarginCm: DEFAULT_CLEARANCE_MARGIN_CM },
    equipment: [],
    attachments: [],
    exclusions: [],
    limitations: [],
    schedule: { templateId: DEFAULT_TEMPLATE_ID, sessionMinutes: DEFAULT_SESSION_MINUTES, overrides: {} },
  };
}
