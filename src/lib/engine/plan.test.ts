import { describe, expect, it } from 'vitest';
import type { Exercise } from '../content/schemas';
import { type DayPlan, estimateDay, fitToTime, type SlotPlan, WARMUP_SEC, withEstimate } from './plan';
import { syntheticExercise } from './testing/fixtures';

const bench = syntheticExercise({ id: 'db-bench-press', pattern: 'horizontal-push', setupState: { station: 'bench', benchAngleDeg: 0 }, setupSeconds: 60, repSeconds: 4 });
const incline = syntheticExercise({ id: 'incline-press', pattern: 'incline-push', setupState: { station: 'bench', benchAngleDeg: 30 }, setupSeconds: 40, repSeconds: 4 });
const pushdown = syntheticExercise({ id: 'rope-pushdown', pattern: 'elbow-extension', setupState: { station: 'cable', pulley: 'high' }, setupSeconds: 45, repSeconds: 3 });
const facePull = syntheticExercise({ id: 'face-pull', pattern: 'rear-delt', setupState: { station: 'cable', pulley: 'high' }, setupSeconds: 30, repSeconds: 3 });
const curl = syntheticExercise({ id: 'cable-curl', pattern: 'elbow-flexion', setupState: { station: 'cable', pulley: 'low' }, setupSeconds: 30, repSeconds: 3 });
const split = syntheticExercise({ id: 'split-squat', pattern: 'lunge', tags: ['unilateral'], setupSeconds: 20, repSeconds: 3 });
const plank = syntheticExercise({ id: 'plank', pattern: 'core-anti-extension', setupSeconds: 10, repSeconds: 1 });

let n = 0;
function slot(pick: Exercise | undefined, over: Partial<SlotPlan> = {}): SlotPlan {
  const index = over.index ?? n++;
  return {
    key: `mon/${index}`,
    index,
    patterns: pick ? [pick.pattern] : ['calf'],
    sets: 3,
    reps: [8, 10],
    rir: 2,
    restSec: 60,
    priority: 1,
    pick,
    why: [],
    notes: [],
    notices: [],
    alternatives: [],
    ...over,
  };
}
const day = (slots: SlotPlan[], budgetMinutes = 30): DayPlan => withEstimate({ weekday: 'mon', kind: 'strength', budgetMinutes, slots });

describe('estimateDay', () => {
  it('adds warm-up, work, rest and the first setup', () => {
    // 3 × (10 × 4) work, 3 × 60 rest, one 60 s setup
    expect(estimateDay([slot(bench, { index: 0 })])).toEqual({
      warmupSec: WARMUP_SEC,
      workSec: 120,
      restSec: 180,
      transitionSec: 60,
      totalSec: WARMUP_SEC + 360,
      minutes: 11,
    });
  });
  it('uses seconds for holds and doubles unilateral work', () => {
    expect(estimateDay([slot(plank, { index: 0, reps: { seconds: 30 } })]).workSec).toBe(90);
    expect(estimateDay([slot(split, { index: 0, reps: [10, 12] })]).workSec).toBe(3 * 2 * 12 * 3);
  });
  it('charges a transition only when station, bench angle or pulley changes', () => {
    const t = (...picks: Exercise[]) => estimateDay(picks.map((p, index) => slot(p, { index }))).transitionSec;
    expect(t(pushdown, facePull)).toBe(45); // same cable station, same pulley
    expect(t(pushdown, curl)).toBe(45 + 30); // pulley high → low
    expect(t(bench, incline)).toBe(60 + 40); // bench angle 0 → 30
    expect(t(bench, pushdown, bench)).toBe(60 + 45 + 60); // station changes twice
  });
  it('skips the first exercise’s rest in a kept superset', () => {
    const straight = estimateDay([slot(pushdown, { index: 0 }), slot(facePull, { index: 1 })]);
    const superset = estimateDay([slot(pushdown, { index: 0 }), slot(facePull, { index: 1, supersetWith: 0 })]);
    expect(straight.restSec - superset.restSec).toBe(3 * 60);
  });
  it('ignores empty slots, and a day with no exercise takes no time', () => {
    expect(estimateDay([slot(bench, { index: 0 }), slot(undefined, { index: 1 })]).totalSec).toBe(WARMUP_SEC + 360);
    expect(estimateDay([slot(undefined, { index: 0 })])).toEqual({ warmupSec: 0, workSec: 0, restSec: 0, transitionSec: 0, totalSec: 0, minutes: 0 });
  });
});

describe('withEstimate', () => {
  it('flags a day over its budget', () => {
    expect(day([slot(bench, { index: 0 })], 11).overBudget).toBe(false);
    expect(day([slot(bench, { index: 0 })], 10).overBudget).toBe(true);
  });
});

describe('fitToTime', () => {
  const full = () => [
    slot(bench, { index: 0, priority: 1 }),
    slot(incline, { index: 1, priority: 2 }),
    slot(pushdown, { index: 2, priority: 3 }),
    slot(facePull, { index: 3, priority: 3, supersetWith: 2 }),
  ];

  it('returns a day that already fits unchanged', () => {
    const d = day(full(), 60);
    expect(fitToTime(d)).toBe(d);
  });
  it('removes priority-3 slots last first, and unlinks their superset partner', () => {
    const d = day(full(), 22);
    const fitted = fitToTime(d);
    expect(fitted.slots.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(fitted.slots[2]!.supersetWith).toBeUndefined();
    expect(fitted.overBudget).toBe(false);
  });
  it('then trims priority-2 sets, never priority 1', () => {
    const fitted = fitToTime(day(full(), 14));
    expect(fitted.slots.map((s) => [s.index, s.sets])).toEqual([
      [0, 3],
      [1, 1],
    ]);
  });
  it('stops when nothing is left to trim, still over budget', () => {
    const fitted = fitToTime(day(full(), 5));
    expect(fitted.slots.map((s) => [s.index, s.sets])).toEqual([
      [0, 3],
      [1, 1],
    ]);
    expect(fitted.overBudget).toBe(true);
  });
});
