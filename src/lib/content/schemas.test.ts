import { describe, expect, it } from 'vitest';
import { AttachmentSchema, DaySchema, EquipmentSchema, ExerciseSchema, TemplateSchema, slotPatterns } from './schemas';

const T = (en: string) => ({ en, zh: `中文${en}` });

const EXERCISE = {
  id: 'smith-squat',
  name: T('Smith Machine Squat'),
  pattern: 'squat',
  muscles: { primary: ['quadriceps', 'glutes'], secondary: ['adductors'] },
  requires: { capabilities: ['smith-bar'], attachments: [] },
  tags: [],
  jointStress: { knee: 'moderate', lowBack: 'moderate', shoulder: 'low', wrist: 'low' },
  guideSection: 'lower-squat',
  setupState: { station: 'smith' },
  setupSeconds: 60,
  repSeconds: 4,
  setup: T('setup'),
  cues: [T('cue 1'), T('cue 2')],
  mistakes: [T('mistake')],
  warmup: T('warm-up'),
  alternatives: [],
  figure: { spec: 'smith-squat' },
};

const SLOT = { pattern: 'horizontal-push', sets: 3, reps: [8, 10], rir: 2, restSec: 90, priority: 1 };
const DAY = { weekday: 'mon', kind: 'strength', focus: T('Push'), minutes: 35, slots: [SLOT] };

describe('EquipmentSchema', () => {
  const eq = {
    id: 'smith-functional-trainer',
    kind: 'station',
    name: T('Smith machine + functional trainer'),
    capabilities: ['smith-bar', 'cable-column'],
    parameters: { smithLowestBarHeightCm: { type: 'cm', label: T('Lowest bar height'), how: T('Measure') } },
    illustrativeDefaults: { smithLowestBarHeightCm: 40 },
  };
  it('accepts a valid entry and defaults the optional maps', () => {
    expect(EquipmentSchema.parse(eq).id).toBe('smith-functional-trainer');
    const bare = EquipmentSchema.parse({ id: 'ab-wheel', kind: 'accessory', name: T('Ab wheel'), capabilities: ['ab-wheel'] });
    expect(bare.parameters).toEqual({});
    expect(bare.illustrativeDefaults).toEqual({});
  });
  it('rejects missing translations, unknown kinds and unknown keys', () => {
    expect(EquipmentSchema.safeParse({ ...eq, name: { en: 'Smith' } }).success).toBe(false);
    expect(EquipmentSchema.safeParse({ ...eq, kind: 'machine' }).success).toBe(false);
    expect(EquipmentSchema.safeParse({ ...eq, brand: 'x' }).success).toBe(false);
  });
});

describe('AttachmentSchema', () => {
  it('needs at least one capability to fit', () => {
    expect(AttachmentSchema.safeParse({ id: 'rope', name: T('Rope'), fits: [] }).success).toBe(false);
    expect(AttachmentSchema.parse({ id: 'rope', name: T('Rope'), fits: ['cable-column'] }).fits).toEqual(['cable-column']);
  });
});

describe('ExerciseSchema', () => {
  it('accepts the spec example shape', () => {
    const e = ExerciseSchema.parse(EXERCISE);
    expect(e.requires.attachmentUses).toEqual({});
    expect(e.muscles.secondary).toEqual(['adductors']);
  });
  it('needs 2–3 cues', () => {
    expect(ExerciseSchema.safeParse({ ...EXERCISE, cues: [T('one')] }).success).toBe(false);
    expect(ExerciseSchema.safeParse({ ...EXERCISE, cues: [T('1'), T('2'), T('3'), T('4')] }).success).toBe(false);
  });
  it('requires a figure unless the pattern is cardio', () => {
    const noFigure: Record<string, unknown> = { ...EXERCISE };
    delete noFigure.figure;
    expect(ExerciseSchema.safeParse(noFigure).success).toBe(false);
    expect(ExerciseSchema.safeParse({ ...noFigure, pattern: 'cardio-steady', setupState: { station: 'cardio' } }).success).toBe(true);
  });
  it('rejects self-alternatives and pulleys away from the cable station', () => {
    expect(ExerciseSchema.safeParse({ ...EXERCISE, alternatives: ['smith-squat'] }).success).toBe(false);
    expect(ExerciseSchema.safeParse({ ...EXERCISE, setupState: { station: 'smith', pulley: 'low' } }).success).toBe(false);
  });
  it('rejects unknown patterns, muscles and stress levels', () => {
    expect(ExerciseSchema.safeParse({ ...EXERCISE, pattern: 'deadlift' }).success).toBe(false);
    expect(ExerciseSchema.safeParse({ ...EXERCISE, muscles: { primary: ['quads'] } }).success).toBe(false);
    expect(ExerciseSchema.safeParse({ ...EXERCISE, jointStress: { ...EXERCISE.jointStress, knee: 'extreme' } }).success).toBe(false);
  });
});

describe('DaySchema', () => {
  it('accepts a strength day and a bare rest day', () => {
    expect(DaySchema.parse(DAY).slots).toHaveLength(1);
    expect(DaySchema.parse({ weekday: 'sun', kind: 'rest' }).slots).toEqual([]);
  });
  it('accepts timed reps and pattern lists', () => {
    const d = DaySchema.parse({ ...DAY, slots: [{ ...SLOT, pattern: ['squat', 'lunge'], reps: { seconds: 30 } }] });
    expect(slotPatterns(d.slots[0]!)).toEqual(['squat', 'lunge']);
  });
  it('needs focus, minutes and slots on training days, and no slots on rest days', () => {
    expect(DaySchema.safeParse({ ...DAY, focus: undefined }).success).toBe(false);
    expect(DaySchema.safeParse({ ...DAY, minutes: undefined }).success).toBe(false);
    expect(DaySchema.safeParse({ ...DAY, slots: [] }).success).toBe(false);
    expect(DaySchema.safeParse({ weekday: 'sun', kind: 'rest', slots: [SLOT] }).success).toBe(false);
  });
  it('rejects an inverted rep range', () => {
    expect(DaySchema.safeParse({ ...DAY, slots: [{ ...SLOT, reps: [12, 8] }] }).success).toBe(false);
  });
  it('checks superset pairing', () => {
    const two = [SLOT, { ...SLOT, supersetWith: 0 }];
    expect(DaySchema.safeParse({ ...DAY, slots: two }).success).toBe(true);
    expect(DaySchema.safeParse({ ...DAY, slots: [{ ...SLOT, supersetWith: 0 }] }).success).toBe(false);
    expect(DaySchema.safeParse({ ...DAY, slots: [SLOT, { ...SLOT, supersetWith: 5 }] }).success).toBe(false);
    const clash = [SLOT, { ...SLOT, supersetWith: 0 }, { ...SLOT, supersetWith: 0 }];
    expect(DaySchema.safeParse({ ...DAY, slots: clash }).success).toBe(false);
  });
  it('caps a full-body day at 10 sets, all at RIR ≥ 2', () => {
    const slots = (sets: number, rir: number) => Array.from({ length: 4 }, () => ({ ...SLOT, sets, rir }));
    expect(DaySchema.safeParse({ ...DAY, fullBody: true, slots: slots(2, 2) }).success).toBe(true);
    expect(DaySchema.safeParse({ ...DAY, fullBody: true, slots: slots(3, 2) }).success).toBe(false);
    expect(DaySchema.safeParse({ ...DAY, fullBody: true, slots: slots(2, 1) }).success).toBe(false);
  });
});

describe('TemplateSchema', () => {
  it('rejects duplicate weekdays and all-rest weeks', () => {
    const name = T('Template');
    expect(TemplateSchema.safeParse({ id: 'tpl', name, days: [DAY, { weekday: 'sun', kind: 'rest' }] }).success).toBe(true);
    expect(TemplateSchema.safeParse({ id: 'tpl', name, days: [DAY, DAY] }).success).toBe(false);
    expect(TemplateSchema.safeParse({ id: 'tpl', name, days: [{ weekday: 'sun', kind: 'rest' }] }).success).toBe(false);
  });
});
