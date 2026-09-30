/**
 * Synthetic content and profiles for engine tests. Every value here is invented for testing; none
 * describes a real person, home or machine (spec §13).
 */
import type { Catalog } from '../../content/catalog';
import { AttachmentSchema, type Equipment, EquipmentSchema, type Exercise, ExerciseSchema, type Template, TemplateSchema } from '../../content/schemas';
import { defaultProfile, type Profile } from '../../profile/schema';

/** A standard 8 ft ceiling (243.84 cm): the tall-enough room in these tests. */
export const EIGHT_FT_CEILING_CM = 8 * 30.48;

const T = (en: string) => ({ en, zh: `中文${en}` });
const text = (label: string) => ({ label: T(label), how: T(`How to measure: ${label}`) });

export const SYN_EQUIPMENT: Equipment[] = [
  EquipmentSchema.parse({
    id: 'smith-functional-trainer',
    kind: 'station',
    name: T('Smith machine + functional trainer'),
    capabilities: ['smith-bar', 'rack-uprights', 'cable-column', 'pull-up-bar'],
    parameters: {
      smithLowestBarHeightCm: { type: 'cm', ...text('Lowest bar') },
      smithHighestBarHeightCm: { type: 'cm', ...text('Highest bar') },
      pullUpBarHeightCm: { type: 'cm', ...text('Pull-up bar') },
      benchFitsInsideRack: { type: 'bool', ...text('Bench fits') },
      cableStack: { type: 'stack', ...text('Stack') },
    },
    // Typical dimensions, used whenever the profile has no measurement (D12).
    illustrativeDefaults: { smithLowestBarHeightCm: 40, smithHighestBarHeightCm: 180, pullUpBarHeightCm: 210, benchFitsInsideRack: true },
  }),
  EquipmentSchema.parse({ id: 'adjustable-bench', kind: 'bench', name: T('Adjustable bench'), capabilities: ['flat-bench', 'incline-bench'] }),
  EquipmentSchema.parse({
    id: 'dumbbells',
    kind: 'free-weight',
    name: T('Dumbbells'),
    capabilities: ['dumbbells'],
    parameters: { dumbbellLoads: { type: 'weights', ...text('Dumbbells') } },
  }),
  EquipmentSchema.parse({ id: 'treadmill', kind: 'cardio', name: T('Treadmill'), capabilities: ['treadmill'] }),
];

export const SYN_ATTACHMENTS = [
  AttachmentSchema.parse({ id: 'rope', name: T('Rope'), fits: ['cable-column'] }),
  AttachmentSchema.parse({ id: 'lat-bar', name: T('Lat bar'), fits: ['cable-column'] }),
];

type Stress = 'low' | 'moderate' | 'high';
const stress = (knee: Stress, lowBack: Stress, shoulder: Stress, wrist: Stress) => ({ knee, lowBack, shoulder, wrist });

/** A valid synthetic exercise; `figure.spec` defaults to its own id so tests can register probes by id. */
export function syntheticExercise(over: Record<string, unknown> & { id: string }): Exercise {
  return ExerciseSchema.parse({
    name: T(over.id),
    pattern: 'squat',
    muscles: { primary: ['quadriceps'] },
    requires: {},
    jointStress: stress('low', 'low', 'low', 'low'),
    guideSection: 'lower-squat',
    setupState: { station: 'floor' },
    setupSeconds: 30,
    repSeconds: 3,
    setup: T('setup'),
    cues: [T('cue one'), T('cue two')],
    mistakes: [T('mistake')],
    warmup: T('warm-up'),
    figure: { spec: over.id },
    ...over,
  });
}

export const SYN_EXERCISES: Exercise[] = [
  syntheticExercise({ id: 'smith-squat', requires: { capabilities: ['smith-bar'] }, setupState: { station: 'smith' }, setupSeconds: 60, repSeconds: 4, jointStress: stress('moderate', 'moderate', 'low', 'low') }),
  syntheticExercise({ id: 'goblet-squat', requires: { capabilities: ['dumbbells'] }, jointStress: stress('moderate', 'low', 'low', 'low') }),
  syntheticExercise({ id: 'box-squat', requires: { capabilities: ['dumbbells', 'flat-bench'] }, setupState: { station: 'bench', benchAngleDeg: 0 }, jointStress: stress('low', 'low', 'low', 'low') }),
  syntheticExercise({ id: 'split-squat', pattern: 'lunge', tags: ['unilateral'], requires: { capabilities: ['dumbbells'] }, jointStress: stress('high', 'low', 'low', 'low') }),
  syntheticExercise({ id: 'smith-bench-press', pattern: 'horizontal-push', requires: { capabilities: ['smith-bar', 'flat-bench'] }, setupState: { station: 'smith', benchAngleDeg: 0 }, setupSeconds: 90, jointStress: stress('low', 'low', 'moderate', 'low') }),
  syntheticExercise({ id: 'db-bench-press', pattern: 'horizontal-push', requires: { capabilities: ['dumbbells', 'flat-bench'] }, setupState: { station: 'bench', benchAngleDeg: 0 }, jointStress: stress('low', 'low', 'moderate', 'low') }),
  syntheticExercise({ id: 'push-up', pattern: 'horizontal-push', jointStress: stress('low', 'low', 'moderate', 'high') }),
  syntheticExercise({ id: 'db-shoulder-press', pattern: 'vertical-push', requires: { capabilities: ['dumbbells', 'incline-bench'] }, setupState: { station: 'bench', benchAngleDeg: 90 }, jointStress: stress('low', 'low', 'high', 'low') }),
  syntheticExercise({ id: 'db-lateral-raise', pattern: 'shoulder-abduction', requires: { capabilities: ['dumbbells'] }, repSeconds: 3 }),
  syntheticExercise({ id: 'rope-pushdown', pattern: 'elbow-extension', requires: { capabilities: ['cable-column'], attachments: ['rope'] }, setupState: { station: 'cable', pulley: 'high' } }),
  syntheticExercise({ id: 'lat-pulldown', pattern: 'vertical-pull', requires: { capabilities: ['cable-column'], attachments: ['lat-bar'] }, setupState: { station: 'cable', pulley: 'high' } }),
  syntheticExercise({ id: 'pull-up', pattern: 'vertical-pull', requires: { capabilities: ['pull-up-bar'] }, setupState: { station: 'smith' } }),
  syntheticExercise({ id: 'plank', pattern: 'core-anti-extension', tags: ['isometric'], repSeconds: 1 }),
  syntheticExercise({ id: 'treadmill-walk', pattern: 'cardio-steady', requires: { capabilities: ['treadmill'] }, setupState: { station: 'cardio' }, figure: undefined }),
];

export const SYN_TEMPLATE: Template = TemplateSchema.parse({
  id: 'syn-3day',
  name: T('Synthetic 3-day'),
  days: [
    {
      weekday: 'mon',
      kind: 'strength',
      focus: T('Push'),
      minutes: 30,
      slots: [
        { pattern: 'horizontal-push', sets: 3, reps: [8, 10], rir: 2, restSec: 90, priority: 1 },
        { pattern: 'vertical-push', sets: 2, reps: [10, 12], rir: 2, restSec: 75, priority: 2 },
        { pattern: 'elbow-extension', sets: 2, reps: [12, 15], rir: 2, restSec: 45, priority: 3 },
        { pattern: 'shoulder-abduction', sets: 2, reps: [12, 15], rir: 2, restSec: 45, priority: 3, supersetWith: 2 },
      ],
    },
    {
      weekday: 'tue',
      kind: 'strength',
      focus: T('Legs'),
      minutes: 30,
      slots: [
        { pattern: 'squat', sets: 3, reps: [8, 10], rir: 2, restSec: 120, priority: 1 },
        { pattern: 'lunge', sets: 2, reps: [10, 12], rir: 2, restSec: 60, priority: 2 },
        { pattern: 'core-anti-extension', sets: 3, reps: { seconds: 30 }, rir: 2, restSec: 30, priority: 3 },
      ],
    },
    { weekday: 'wed', kind: 'cardio-core', focus: T('Cardio'), minutes: 30, slots: [{ pattern: 'cardio-steady', sets: 1, reps: { seconds: 1200 }, restSec: 0, priority: 1 }] },
    {
      weekday: 'thu',
      kind: 'strength',
      focus: T('Pull and legs'),
      minutes: 30,
      fullBody: true,
      slots: [
        { pattern: 'vertical-pull', sets: 3, reps: [6, 10], rir: 2, restSec: 90, priority: 1 },
        { pattern: ['squat', 'lunge'], sets: 3, reps: [8, 10], rir: 2, restSec: 90, priority: 1 },
      ],
    },
    { weekday: 'sun', kind: 'rest' },
  ],
});

/** One strength day with five priority-1 slots, every one fillable with dumbbells or body weight: more than a short session keeps. */
export const SYN_MANY_PRIORITY_TEMPLATE: Template = TemplateSchema.parse({
  id: 'syn-many-priority',
  name: T('Synthetic many-priority day'),
  days: [
    {
      weekday: 'fri',
      kind: 'strength',
      focus: T('Full body'),
      minutes: 60,
      slots: [
        { pattern: 'horizontal-push', sets: 3, reps: [8, 10], rir: 2, restSec: 90, priority: 1 },
        { pattern: 'squat', sets: 3, reps: [8, 10], rir: 1, restSec: 90, priority: 1 },
        { pattern: 'lunge', sets: 3, reps: [10, 12], rir: 2, restSec: 60, priority: 1 },
        { pattern: 'shoulder-abduction', sets: 3, reps: [12, 15], rir: 2, restSec: 45, priority: 1 },
        { pattern: 'core-anti-extension', sets: 3, reps: { seconds: 30 }, rir: 2, restSec: 30, priority: 1 },
      ],
    },
  ],
});

export function syntheticCatalog(over: Partial<{ exercises: Exercise[]; equipment: Equipment[] }> = {}): Catalog {
  const map = <V extends { id: string }>(items: readonly V[]) => new Map(items.map((i) => [i.id, i]));
  return {
    equipment: map(over.equipment ?? SYN_EQUIPMENT),
    attachments: map(SYN_ATTACHMENTS),
    exercises: map(over.exercises ?? SYN_EXERCISES),
    templates: map([SYN_TEMPLATE]),
  };
}

/** Everything owned; height and an 8 ft ceiling entered; two stops measured, the rest typical (D12). */
export function fullHomeGym(): Profile {
  return {
    ...defaultProfile('en'),
    statureCm: 172,
    room: { ceilingHeightCm: EIGHT_FT_CEILING_CM, clearanceMarginCm: 10 },
    equipment: [
      {
        id: 'smith-functional-trainer',
        params: { smithLowestBarHeightCm: 45, smithHighestBarHeightCm: 185, cableStack: { first: 5, last: 80, step: 5, unit: 'kg' } },
      },
      { id: 'adjustable-bench', params: {} },
      { id: 'dumbbells', params: { dumbbellLoads: { unit: 'kg', loads: [2, 4, 6, 8, 10, 12.5, 15] } } },
    ],
    attachments: ['rope', 'lat-bar'],
    schedule: { templateId: 'syn-3day', sessionMinutes: 40, overrides: {} },
  };
}

/** Dumbbells and a bench only; no ceiling entered. */
export function dumbbellsOnly(): Profile {
  return {
    ...fullHomeGym(),
    statureCm: 165,
    room: { clearanceMarginCm: 10 },
    equipment: [
      { id: 'adjustable-bench', params: {} },
      { id: 'dumbbells', params: { dumbbellLoads: { unit: 'lb', loads: [5, 15, 25] } } },
    ],
    attachments: [],
  };
}

/** Everything owned, nothing entered: no height, no ceiling, no equipment values (D12: all typical). */
export function nothingMeasured(): Profile {
  const p = fullHomeGym();
  return { ...p, statureCm: undefined, room: { clearanceMarginCm: 10 }, equipment: p.equipment.map((e) => ({ id: e.id, params: {} })) };
}

/** A tall user under a low ceiling. */
export function lowCeiling(): Profile {
  return { ...fullHomeGym(), statureCm: 188, room: { ceilingHeightCm: 225, clearanceMarginCm: 10 } };
}
