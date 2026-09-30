import { describe, expect, it } from 'vitest';
import { TemplateSchema } from '../content/schemas';
import type { Profile } from '../profile/schema';
import type { GeometryProbe } from './geometry';
import { DEFAULT_PROBES } from './probes';
import { buildWeek, limitationNotes, rankCandidates } from './week';
import { fullHomeGym, nothingMeasured, SYN_TEMPLATE, syntheticCatalog, syntheticExercise } from './testing/fixtures';

const catalog = syntheticCatalog();
const ex = (id: string) => catalog.exercises.get(id)!;
const benchProbe: GeometryProbe = () => ({ topCm: 150, barCentersCm: [95, 140], rom: [], posing: [] });
const opts = { probes: { ...DEFAULT_PROBES, 'smith-bench-press': benchProbe } };
const build = (p: Profile, tpl = SYN_TEMPLATE) => buildWeek(tpl, p, catalog, opts);
const picks = (p: Profile, tpl = SYN_TEMPLATE) =>
  Object.fromEntries(build(p, tpl).days.flatMap((d) => d.slots.map((s) => [s.key, s.pick?.id ?? null])));
const slotAt = (p: Profile, key: string) => build(p).days.flatMap((d) => d.slots).find((s) => s.key === key)!;

describe('rankCandidates', () => {
  const none = { limitations: [], used: new Set<string>() };
  it('breaks ties by id', () => {
    expect(rankCandidates([ex('smith-squat'), ex('goblet-squat'), ex('box-squat')], none).map((r) => r.exercise.id)).toEqual([
      'box-squat',
      'goblet-squat',
      'smith-squat',
    ]);
  });
  it('gives +3 for the same station as the previous pick', () => {
    const r = rankCandidates([ex('goblet-squat'), ex('smith-squat')], { ...none, previous: ex('smith-bench-press') });
    expect(r.map((x) => [x.exercise.id, x.score])).toEqual([
      ['smith-squat', 3],
      ['goblet-squat', 0],
    ]);
    expect(r[0]!.why).toEqual([{ key: 'engine.why.fits' }, { key: 'engine.why.sameStation' }]);
  });
  it('gives +2 per limitation with low stress and −3 per limitation with high stress', () => {
    const r = rankCandidates([ex('push-up'), ex('db-bench-press')], { ...none, limitations: ['wrist-sensitive', 'knee-sensitive'] });
    expect(r.map((x) => [x.exercise.id, x.score])).toEqual([
      ['db-bench-press', 4],
      ['push-up', -1],
    ]);
    expect(r[1]!.why).toContainEqual({ key: 'engine.why.hardOnJoint', params: { joint: { key: 'joint.wrist' } } });
  });
  it('gives −2 for an exercise already used this week', () => {
    const r = rankCandidates([ex('box-squat'), ex('goblet-squat')], { ...none, used: new Set(['box-squat']) });
    expect(r.map((x) => [x.exercise.id, x.score])).toEqual([
      ['goblet-squat', 0],
      ['box-squat', -2],
    ]);
  });
});

describe('limitationNotes', () => {
  it('adds a note for moderate or high stress on a sensitive joint', () => {
    expect(limitationNotes(ex('db-shoulder-press'), ['shoulder-sensitive'])).toEqual([
      { key: 'engine.note.jointHigh', params: { joint: { key: 'joint.shoulder' } } },
    ]);
    expect(limitationNotes(ex('smith-squat'), ['knee-sensitive', 'wrist-sensitive'])).toEqual([
      { key: 'engine.note.jointModerate', params: { joint: { key: 'joint.knee' } } },
    ]);
  });
});

describe('buildWeek', () => {
  it('fills every slot deterministically', () => {
    expect(picks(fullHomeGym())).toEqual({
      'mon/0': 'db-bench-press',
      'mon/1': 'db-shoulder-press',
      'mon/2': 'rope-pushdown',
      'mon/3': 'db-lateral-raise',
      'tue/0': 'box-squat',
      'tue/1': 'split-squat',
      'tue/2': 'plank',
      'wed/0': null,
      'thu/0': 'lat-pulldown',
      'thu/1': 'goblet-squat',
    });
    expect(build(fullHomeGym())).toEqual(build(fullHomeGym()));
  });

  it('explains picks and lists feasible alternatives', () => {
    const s = slotAt(fullHomeGym(), 'mon/1');
    expect(s.why).toEqual([{ key: 'engine.why.fits' }, { key: 'engine.why.sameStation' }]);
    expect(slotAt(fullHomeGym(), 'mon/0').alternatives).toEqual(['push-up', 'smith-bench-press']);
  });

  it('ranks exercises used earlier in the week lower', () => {
    // box-squat (tue/0) and split-squat (tue/1) were used, so they rank below the unused squats.
    const s = slotAt(fullHomeGym(), 'thu/1');
    expect(s.pick?.id).toBe('goblet-squat');
    expect(s.alternatives).toEqual(['smith-squat', 'box-squat', 'split-squat']);
  });

  it('keeps an unfillable slot with reasons and what would unlock it', () => {
    const s = slotAt(fullHomeGym(), 'wed/0');
    expect(s.pick).toBeUndefined();
    expect(s.empty).toEqual({
      reasons: [
        { key: 'engine.empty.noneFeasible' },
        { key: 'engine.reason.missingCapability', params: { equipment: [catalog.equipment.get('treadmill')!.name] } },
      ],
      unlock: [{ kind: 'equipment', equipmentIds: ['treadmill'] }],
    });
  });

  it('says so when the library has no exercise for a slot', () => {
    const tpl = TemplateSchema.parse({ ...SYN_TEMPLATE, days: [{ weekday: 'mon', kind: 'mobility', focus: SYN_TEMPLATE.name, minutes: 20, slots: [{ pattern: 'mobility', sets: 1, reps: { seconds: 60 }, restSec: 0, priority: 1 }] }] });
    expect(buildWeek(tpl, fullHomeGym(), catalog, opts).days[0]!.slots[0]!.empty).toEqual({ reasons: [{ key: 'engine.empty.noExercise' }], unlock: [] });
  });

  describe('typical values (D12)', () => {
    it('plans a profile with nothing entered, and says what it assumed', () => {
      expect(picks(nothingMeasured())).toEqual(picks(fullHomeGym()));
      expect(build(nothingMeasured()).assumptions).toEqual([
        { key: 'engine.assumed.stature', params: { height: { lengthCm: 175 } } },
        { key: 'engine.assumed.ceiling', params: { ceiling: { lengthCm: 240 } } },
      ]);
      expect(build(fullHomeGym()).assumptions).toEqual([]);
    });
    it('keeps an overhead exercise under an assumed ceiling, with the clearance note before safety notes', () => {
      const p: Profile = { ...nothingMeasured(), limitations: ['shoulder-sensitive'] };
      const s = slotAt(p, 'mon/1');
      expect(s.pick?.id).toBe('db-shoulder-press');
      expect(s.notes).toEqual([
        { key: 'engine.note.checkClearance', params: { need: { lengthCm: 243 }, margin: { lengthCm: 10 }, ceiling: { lengthCm: 240 } } },
        { key: 'engine.note.jointHigh', params: { joint: { key: 'joint.shoulder' } } },
      ]);
    });
  });

  describe('limitations', () => {
    it('re-rank picks and add safety notes', () => {
      const p: Profile = { ...fullHomeGym(), limitations: ['shoulder-sensitive'] };
      expect(slotAt(p, 'mon/1').notes).toEqual([{ key: 'engine.note.jointHigh', params: { joint: { key: 'joint.shoulder' } } }]);
      const knees: Profile = { ...fullHomeGym(), limitations: ['knee-sensitive'] };
      // box-squat: +2 (knee low) −2 (used on tue) = 0 ties goblet-squat (0) and wins on id.
      expect(picks(knees)['thu/1']).toBe('box-squat');
      expect(slotAt(knees, 'tue/0').why).toContainEqual({ key: 'engine.why.easyOnJoint', params: { joint: { key: 'joint.knee' } } });
    });
  });

  describe('overrides', () => {
    const withOverride = (key: string, id: string): Profile => ({ ...fullHomeGym(), schedule: { ...fullHomeGym().schedule, overrides: { [key]: id } } });
    it('uses a feasible override', () => {
      const s = slotAt(withOverride('mon/0', 'smith-bench-press'), 'mon/0');
      expect(s.pick?.id).toBe('smith-bench-press');
      expect(s.why).toEqual([{ key: 'engine.why.override' }]);
      expect(s.alternatives).toEqual(['db-bench-press', 'push-up']);
    });
    it('drops an override that is no longer feasible, with a notice', () => {
      const p = withOverride('mon/0', 'smith-bench-press');
      const s = slotAt({ ...p, exclusions: ['smith-bench-press'] }, 'mon/0');
      expect(s.pick?.id).toBe('db-bench-press');
      expect(s.notices).toEqual([{ key: 'engine.notice.overrideDropped', params: { exercise: ex('smith-bench-press').name } }]);
    });
    it('drops an override for an unknown exercise or another pattern', () => {
      expect(slotAt(withOverride('mon/0', 'plank'), 'mon/0').notices).toEqual([{ key: 'engine.notice.overrideInvalid' }]);
      expect(slotAt(withOverride('mon/0', 'no-such-exercise'), 'mon/0').notices).toEqual([{ key: 'engine.notice.overrideInvalid' }]);
    });
  });

  describe('supersets', () => {
    it('drops the pairing when the picks use different stations', () => {
      const s = slotAt(fullHomeGym(), 'mon/3');
      expect(s.supersetWith).toBeUndefined();
    });
    it('keeps the pairing when both picks share a station', () => {
      const tpl = TemplateSchema.parse({
        ...SYN_TEMPLATE,
        days: [
          {
            weekday: 'mon',
            kind: 'strength',
            focus: SYN_TEMPLATE.name,
            minutes: 30,
            slots: [
              { pattern: 'vertical-pull', sets: 3, reps: [8, 10], rir: 2, restSec: 60, priority: 1 },
              { pattern: 'elbow-extension', sets: 3, reps: [12, 15], rir: 2, restSec: 60, priority: 2, supersetWith: 0 },
            ],
          },
        ],
      });
      const day = buildWeek(tpl, fullHomeGym(), catalog, opts).days[0]!;
      expect(day.slots.map((s) => s.pick?.id)).toEqual(['lat-pulldown', 'rope-pushdown']);
      expect(day.slots[1]!.supersetWith).toBe(0);
    });
  });

  describe('time budget', () => {
    it('uses the shorter of the template day and the profile session length', () => {
      const w = build(fullHomeGym());
      expect(w.days.map((d) => d.budgetMinutes)).toEqual([30, 30, 30, 30, 0]);
      const short: Profile = { ...fullHomeGym(), schedule: { ...fullHomeGym().schedule, sessionMinutes: 20 } };
      expect(build(short).days[0]!.budgetMinutes).toBe(20);
    });
    it('estimates every day and flags days over budget', () => {
      const w = build(fullHomeGym());
      const mon = w.days[0]!;
      expect(mon.estimate.totalSec).toBeGreaterThan(0);
      expect(mon.overBudget).toBe(mon.estimate.minutes > mon.budgetMinutes);
      expect(w.days[4]).toMatchObject({ kind: 'rest', slots: [], overBudget: false, estimate: { totalSec: 0 } });
    });
  });

  it('scales to a catalog with more candidates without changing earlier picks', () => {
    const extra = syntheticExercise({ id: 'zz-squat', requires: { capabilities: ['dumbbells'] }, jointStress: { knee: 'moderate', lowBack: 'low', shoulder: 'low', wrist: 'low' } });
    const bigger = syntheticCatalog({ exercises: [...catalog.exercises.values(), extra] });
    expect(buildWeek(SYN_TEMPLATE, fullHomeGym(), bigger, opts).days[1]!.slots[0]!.pick?.id).toBe('box-squat');
  });
});
