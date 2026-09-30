import { describe, expect, it } from 'vitest';
import type { Exercise } from '../content/schemas';
import { type DayPlan, type SlotPlan, withEstimate } from './plan';
import { shortSession } from './shortSession';
import { syntheticExercise } from './testing/fixtures';

const a = syntheticExercise({ id: 'a-press', pattern: 'horizontal-push' });
const b = syntheticExercise({ id: 'b-row', pattern: 'horizontal-pull' });
const c = syntheticExercise({ id: 'c-squat', pattern: 'squat' });
const d = syntheticExercise({ id: 'd-hinge', pattern: 'hip-hinge' });
const e = syntheticExercise({ id: 'e-curl', pattern: 'elbow-flexion' });

function slot(index: number, pick: Exercise | undefined, over: Partial<SlotPlan> = {}): SlotPlan {
  return {
    key: `fri/${index}`,
    index,
    patterns: [pick?.pattern ?? 'calf'],
    sets: 3,
    reps: [8, 10],
    rir: 2,
    restSec: 90,
    priority: 1,
    pick,
    why: [],
    notes: [],
    notices: [],
    alternatives: [],
    ...over,
  };
}
const day = (slots: SlotPlan[]): DayPlan => withEstimate({ weekday: 'fri', kind: 'strength', budgetMinutes: 35, slots });

describe('shortSession', () => {
  it('keeps the first three filled priority-1 slots at 2 sets and RIR ≥ 3', () => {
    const s = shortSession(
      day([
        slot(0, a),
        slot(1, e, { priority: 2 }),
        slot(2, undefined),
        slot(3, b, { sets: 1, rir: 4 }),
        slot(4, c),
        slot(5, d),
      ]),
    );
    expect(s.slots.map((x) => [x.index, x.sets, x.rir])).toEqual([
      [0, 2, 3],
      [3, 1, 4],
      [4, 2, 3],
    ]);
  });
  it('re-estimates the time', () => {
    const full = day([slot(0, a), slot(1, b), slot(2, c)]);
    const short = shortSession(full);
    expect(short.estimate.totalSec).toBeLessThan(full.estimate.totalSec);
    expect(short.estimate.workSec).toBeCloseTo((2 / 3) * full.estimate.workSec);
  });
  it('keeps a superset only when both partners stay', () => {
    const s = shortSession(day([slot(0, a), slot(1, b, { supersetWith: 0 }), slot(2, c, { priority: 3 }), slot(3, d, { supersetWith: 2 })]));
    expect(s.slots.map((x) => [x.index, x.supersetWith])).toEqual([
      [0, undefined],
      [1, 0],
      [3, undefined],
    ]);
  });
  it('leaves slots without an RIR target without one', () => {
    const walk = syntheticExercise({ id: 'walk', pattern: 'cardio-steady', setupState: { station: 'cardio' }, figure: undefined });
    const s = shortSession(day([slot(0, walk, { sets: 1, reps: { seconds: 1200 }, rir: undefined })]));
    expect(s.slots[0]).toMatchObject({ sets: 1, rir: undefined });
  });
});
