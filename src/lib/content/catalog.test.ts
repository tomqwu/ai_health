import { describe, expect, it } from 'vitest';
import { buildCatalog, CatalogError, type CatalogInput } from './catalog';
import { AttachmentSchema, EquipmentSchema, ExerciseSchema, TemplateSchema } from './schemas';
import { GEOMETRY_PARAMS } from './vocab';

const T = (en: string) => ({ en, zh: `中文${en}` });

const smith = EquipmentSchema.parse({
  id: 'smith-functional-trainer',
  kind: 'station',
  name: T('Smith machine + functional trainer'),
  capabilities: ['smith-bar', 'cable-column', 'rack-uprights'],
  parameters: { smithLowestBarHeightCm: { type: 'cm', label: T('Lowest bar'), how: T('Measure') } },
  illustrativeDefaults: { smithLowestBarHeightCm: 40 },
});
const rope = AttachmentSchema.parse({ id: 'rope', name: T('Rope'), fits: ['cable-column'] });
const holdDown = AttachmentSchema.parse({
  id: 'roller-hold-down',
  name: T('Roller hold-down'),
  fits: ['rack-uprights'],
  uses: [{ id: 'nordic-curl', name: T('Nordic curl anchor') }],
});
const exercise = (over: Record<string, unknown>) =>
  ExerciseSchema.parse({
    id: 'smith-squat',
    name: T('Smith Machine Squat'),
    pattern: 'squat',
    muscles: { primary: ['quadriceps'] },
    requires: { capabilities: ['smith-bar'] },
    jointStress: { knee: 'moderate', lowBack: 'moderate', shoulder: 'low', wrist: 'low' },
    guideSection: 'lower-squat',
    setupState: { station: 'smith' },
    setupSeconds: 60,
    repSeconds: 4,
    setup: T('setup'),
    cues: [T('a'), T('b')],
    mistakes: [T('m')],
    warmup: T('w'),
    figure: { spec: 'smith-squat' },
    ...over,
  });
const template = TemplateSchema.parse({
  id: 'tpl',
  name: T('Template'),
  days: [{ weekday: 'mon', kind: 'strength', focus: T('Legs'), minutes: 30, slots: [{ pattern: 'squat', sets: 3, reps: [8, 10], rir: 2, restSec: 90, priority: 1 }] }],
});

const input = (over: Partial<CatalogInput> = {}): CatalogInput => ({
  equipment: [smith],
  attachments: [rope, holdDown],
  exercises: [exercise({})],
  templates: [template],
  ...over,
});

function problemsOf(i: CatalogInput): readonly string[] {
  try {
    buildCatalog(i);
  } catch (e) {
    if (e instanceof CatalogError) return e.problems;
    throw e;
  }
  return [];
}

describe('buildCatalog', () => {
  it('indexes valid content by id', () => {
    const c = buildCatalog(input());
    expect(c.exercises.get('smith-squat')?.pattern).toBe('squat');
    expect([...c.equipment.keys()]).toEqual(['smith-functional-trainer']);
  });

  it('reports duplicate ids', () => {
    expect(problemsOf(input({ exercises: [exercise({}), exercise({})] }))).toEqual(['exercise "smith-squat" is defined twice']);
  });

  it('checks capabilities, attachments and alternatives, reporting every problem at once', () => {
    const problems = problemsOf(
      input({ exercises: [exercise({ requires: { capabilities: ['landmine'], attachments: ['dip-belt'] }, alternatives: ['goblet-squat'] })] }),
    );
    expect(problems).toEqual([
      'exercise "smith-squat": no equipment provides "landmine"',
      'exercise "smith-squat": unknown attachment "dip-belt"',
      'exercise "smith-squat": unknown alternative "goblet-squat"',
    ]);
  });

  it('checks attachment uses', () => {
    const noUse = exercise({ requires: { capabilities: ['rack-uprights'], attachments: ['roller-hold-down'] } });
    expect(problemsOf(input({ exercises: [noUse] }))).toEqual(['exercise "smith-squat": must declare how it uses "roller-hold-down"']);
    const badUse = exercise({
      requires: { capabilities: ['rack-uprights'], attachments: ['roller-hold-down'], attachmentUses: { 'roller-hold-down': 'leg-curl' } },
    });
    expect(problemsOf(input({ exercises: [badUse] }))).toEqual(['exercise "smith-squat": "roller-hold-down" has no use "leg-curl"']);
    const stray = exercise({ requires: { capabilities: ['smith-bar'], attachmentUses: { 'roller-hold-down': 'nordic-curl' } } });
    expect(problemsOf(input({ exercises: [stray] }))).toEqual([
      'exercise "smith-squat": declares a use for "roller-hold-down" but does not require it',
    ]);
  });

  it('checks figure specs', () => {
    expect(problemsOf(input({ exercises: [exercise({ figure: { spec: 'goblet-squat' } })] }))).toEqual([
      'exercise "smith-squat": unknown figure spec "goblet-squat"',
    ]);
  });

  it('checks attachments fit some equipment', () => {
    const band = AttachmentSchema.parse({ id: 'band-anchor', name: T('Band anchor'), fits: ['door-frame'] });
    expect(problemsOf(input({ attachments: [rope, holdDown, band] }))).toEqual(['attachment "band-anchor": no equipment provides "door-frame"']);
  });

  it('checks illustrative defaults against parameter definitions', () => {
    const bad = { ...smith, illustrativeDefaults: { smithLowestBarHeightCm: -5, ceilingCm: 250 } };
    expect(problemsOf(input({ equipment: [bad] }))).toEqual([
      'equipment "smith-functional-trainer": illustrative default "smithLowestBarHeightCm" is not a valid cm',
      'equipment "smith-functional-trainer": illustrative default "ceilingCm" is not a parameter',
    ]);
  });

  it('requires a typical value for every parameter the geometry checks read (D12)', () => {
    expect(problemsOf(input({ equipment: [{ ...smith, illustrativeDefaults: {} }] }))).toEqual([
      'equipment "smith-functional-trainer": parameter "smithLowestBarHeightCm" is read by the geometry checks and needs an illustrative default',
    ]);
  });

  it('checks illustrative defaults against the declared parameter type, not just the name', () => {
    const typed = EquipmentSchema.parse({
      ...smith,
      parameters: {
        smithLowestBarHeightCm: { type: 'cm', label: T('Lowest bar'), how: T('Measure') },
        benchFitsInsideRack: { type: 'bool', label: T('Bench fits'), how: T('Try it') },
        padCount: { type: 'count', label: T('Pads'), how: T('Count') },
      },
      illustrativeDefaults: { smithLowestBarHeightCm: true, benchFitsInsideRack: 'yes', padCount: 1.5 },
    });
    expect(problemsOf(input({ equipment: [typed] }))).toEqual([
      'equipment "smith-functional-trainer": illustrative default "smithLowestBarHeightCm" is not a valid cm',
      'equipment "smith-functional-trainer": illustrative default "benchFitsInsideRack" is not a valid bool',
      'equipment "smith-functional-trainer": illustrative default "padCount" is not a valid count',
    ]);
  });

  it.each(GEOMETRY_PARAMS)('requires an illustrative default for geometry parameter %s (D12)', (name) => {
    const type = name === 'benchFitsInsideRack' ? 'bool' : 'cm';
    const eq = EquipmentSchema.parse({
      ...smith,
      parameters: { [name]: { type, label: T('Param'), how: T('Measure') } },
      illustrativeDefaults: {},
    });
    expect(problemsOf(input({ equipment: [eq] }))).toEqual([
      `equipment "smith-functional-trainer": parameter "${name}" is read by the geometry checks and needs an illustrative default`,
    ]);
  });

  it('does not require a default for parameters the geometry checks do not read', () => {
    const eq = EquipmentSchema.parse({
      ...smith,
      parameters: { ...smith.parameters, padCount: { type: 'count', label: T('Pads'), how: T('Count') } },
    });
    expect(problemsOf(input({ equipment: [eq] }))).toEqual([]);
  });

  it('requires an exercise for every template slot', () => {
    const tpl = TemplateSchema.parse({
      ...template,
      days: [{ ...template.days[0]!, slots: [{ pattern: ['calf', 'lunge'], sets: 2, reps: [12, 15], rir: 2, restSec: 45, priority: 3 }] }],
    });
    expect(problemsOf(input({ templates: [tpl] }))).toEqual(['template "tpl" mon/0: no exercise for calf | lunge']);
  });
});
