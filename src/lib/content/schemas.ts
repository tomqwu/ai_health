import { z } from 'zod';
import { I18nTextSchema, IdSchema, ParamNameSchema } from './common';
import { ParamDefSchema, ParamValueSchema } from './params';
import {
  CARDIO_PATTERNS,
  DAY_KINDS,
  EQUIPMENT_KINDS,
  EXERCISE_TAGS,
  GUIDE_SECTIONS,
  MUSCLES,
  PATTERNS,
  PULLEY_POSITIONS,
  STATIONS,
  STRESS_LEVELS,
  WEEKDAYS,
} from './vocab';

/** Spec §5.5: the full-body day is capped at this many working sets… */
export const FULL_BODY_MAX_SETS = 10;
/** …all at RIR ≥ this. */
export const FULL_BODY_MIN_RIR = 2;

// ── Equipment (spec §5.1) ─────────────────────────────────────────────────────

export const EquipmentSchema = z.strictObject({
  id: IdSchema,
  kind: z.enum(EQUIPMENT_KINDS),
  name: I18nTextSchema,
  capabilities: z.array(IdSchema).min(1),
  parameters: z.record(ParamNameSchema, ParamDefSchema).default({}),
  /**
   * Typical dimensions (D12): drawn on generic pages, and used by the engine for every unmeasured parameter.
   * Lengths are in cm; Smith bar heights are floor to the centre of the bar (see `GEOMETRY_PARAMS`).
   */
  illustrativeDefaults: z.record(ParamNameSchema, ParamValueSchema).default({}),
  /** Parametric builder id in lib/figure (checked from M3). */
  model3d: IdSchema.optional(),
  /** Guide MDX id (checked from M5). */
  guide: IdSchema.optional(),
});
export type Equipment = z.output<typeof EquipmentSchema>;

// ── Attachments (spec §5.2) ───────────────────────────────────────────────────

export const AttachmentSchema = z.strictObject({
  id: IdSchema,
  name: I18nTextSchema,
  fits: z.array(IdSchema).min(1),
  model3d: IdSchema.optional(),
  /** Distinct ways an exercise can use this attachment (e.g. the roller hold-down). */
  uses: z.array(z.strictObject({ id: IdSchema, name: I18nTextSchema })).optional(),
});
export type Attachment = z.output<typeof AttachmentSchema>;

// ── Exercises (spec §5.3) ─────────────────────────────────────────────────────

const Stress = z.enum(STRESS_LEVELS);

export const SetupStateSchema = z.strictObject({
  station: z.enum(STATIONS),
  benchAngleDeg: z.number().min(-30).max(90).optional(),
  pulley: z.enum(PULLEY_POSITIONS).optional(),
});
export type SetupState = z.output<typeof SetupStateSchema>;

export const ExerciseSchema = z
  .strictObject({
    id: IdSchema,
    name: I18nTextSchema,
    pattern: z.enum(PATTERNS),
    muscles: z.strictObject({
      primary: z.array(z.enum(MUSCLES)).min(1),
      secondary: z.array(z.enum(MUSCLES)).default([]),
    }),
    requires: z.strictObject({
      capabilities: z.array(IdSchema).default([]),
      attachments: z.array(IdSchema).default([]),
      /** attachment id → use id, for attachments that declare `uses`. */
      attachmentUses: z.record(IdSchema, IdSchema).default({}),
    }),
    tags: z.array(z.enum(EXERCISE_TAGS)).default([]),
    jointStress: z.strictObject({ knee: Stress, lowBack: Stress, shoulder: Stress, wrist: Stress }),
    guideSection: z.enum(GUIDE_SECTIONS),
    setupState: SetupStateSchema,
    setupSeconds: z.number().int().min(0).max(600),
    repSeconds: z.number().positive().max(20),
    setup: I18nTextSchema,
    cues: z.array(I18nTextSchema).min(2).max(3),
    mistakes: z.array(I18nTextSchema).min(1),
    warmup: I18nTextSchema,
    safety: I18nTextSchema.optional(),
    alternatives: z.array(IdSchema).default([]),
    /** Figure spec id in lib/figure/fixtures (FIGURES). */
    figure: z.strictObject({ spec: IdSchema }).optional(),
  })
  .superRefine((e, ctx) => {
    if (!e.figure && !CARDIO_PATTERNS.includes(e.pattern)) {
      ctx.addIssue({ code: 'custom', path: ['figure'], message: 'every non-cardio exercise needs a figure' });
    }
    if (e.alternatives.includes(e.id)) {
      ctx.addIssue({ code: 'custom', path: ['alternatives'], message: 'an exercise cannot be its own alternative' });
    }
    if (e.setupState.pulley && e.setupState.station !== 'cable') {
      ctx.addIssue({ code: 'custom', path: ['setupState', 'pulley'], message: 'pulley is only valid at the cable station' });
    }
  });
export type Exercise = z.output<typeof ExerciseSchema>;

// ── Templates (spec §5.5) ─────────────────────────────────────────────────────

export const RepsSchema = z.union([
  z
    .tuple([z.number().int().min(1), z.number().int().min(1)])
    .refine(([lo, hi]) => lo <= hi, { message: 'rep range must be [low, high]' }),
  z.strictObject({ seconds: z.number().int().positive() }),
]);
export type Reps = z.output<typeof RepsSchema>;

export const SlotSchema = z.strictObject({
  pattern: z.union([z.enum(PATTERNS), z.array(z.enum(PATTERNS)).min(1)]),
  sets: z.number().int().min(1).max(10),
  reps: RepsSchema,
  rir: z.number().int().min(0).max(5).optional(),
  restSec: z.number().int().min(0).max(600),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** Zero-based index of the partner slot on the same day. */
  supersetWith: z.number().int().min(0).optional(),
});
export type Slot = z.output<typeof SlotSchema>;

export const DaySchema = z
  .strictObject({
    weekday: z.enum(WEEKDAYS),
    kind: z.enum(DAY_KINDS),
    focus: I18nTextSchema.optional(),
    minutes: z.number().int().min(5).max(180).optional(),
    /** Volume-capped full-body day (spec §5.5). */
    fullBody: z.boolean().optional(),
    slots: z.array(SlotSchema).default([]),
  })
  .superRefine((d, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    if (d.kind === 'rest') {
      if (d.slots.length > 0) issue(['slots'], 'a rest day has no slots');
      return;
    }
    if (!d.focus) issue(['focus'], 'a training day needs a focus');
    if (d.minutes === undefined) issue(['minutes'], 'a training day needs minutes');
    if (d.slots.length === 0) issue(['slots'], 'a training day needs at least one slot');
    const partnerOf = new Map<number, number>();
    d.slots.forEach((s, i) => {
      if (s.supersetWith === undefined) return;
      const j = s.supersetWith;
      if (j === i || j >= d.slots.length) return issue(['slots', i, 'supersetWith'], `no slot ${j} to pair with`);
      for (const [a, b] of [
        [i, j],
        [j, i],
      ] as const) {
        const existing = partnerOf.get(a);
        if (existing !== undefined && existing !== b) issue(['slots', i, 'supersetWith'], `slot ${a} is already paired with slot ${existing}`);
        partnerOf.set(a, b);
      }
    });
    if (d.fullBody) {
      const total = d.slots.reduce((n, s) => n + s.sets, 0);
      if (total > FULL_BODY_MAX_SETS) issue(['slots'], `a full-body day allows at most ${FULL_BODY_MAX_SETS} working sets (has ${total})`);
      d.slots.forEach((s, i) => {
        if ((s.rir ?? -1) < FULL_BODY_MIN_RIR) issue(['slots', i, 'rir'], `full-body slots need RIR ≥ ${FULL_BODY_MIN_RIR}`);
      });
    }
  });
export type Day = z.output<typeof DaySchema>;

export const TemplateSchema = z
  .strictObject({ id: IdSchema, name: I18nTextSchema, days: z.array(DaySchema).min(1).max(7) })
  .superRefine((tpl, ctx) => {
    const seen = new Set<string>();
    tpl.days.forEach((d, i) => {
      if (seen.has(d.weekday)) ctx.addIssue({ code: 'custom', path: ['days', i, 'weekday'], message: `${d.weekday} appears twice` });
      seen.add(d.weekday);
    });
    if (tpl.days.every((d) => d.kind === 'rest')) ctx.addIssue({ code: 'custom', path: ['days'], message: 'a template needs a training day' });
  });
export type Template = z.output<typeof TemplateSchema>;

/** Slot patterns as a list. */
export const slotPatterns = (s: Slot) => (Array.isArray(s.pattern) ? s.pattern : [s.pattern]);
