import { describe, expect, it } from 'vitest';
import { box, mergeBuilt, placeBuilt } from './built';
import { buildExerciseBike, buildRowingMachine, buildTreadmill } from './cardio';
import {
  AB_WHEEL,
  AB_WHEEL_GRIP_OFFSET_CM,
  BARBELL,
  buildAbWheel,
  buildBalanceTrainer,
  buildBand,
  buildBarbell,
  buildDumbbell,
  buildExerciseBall,
  buildRope,
  DUMBBELL,
  ROPE,
} from './implements';
import { aabbOf, type Primitive } from './primitives';

const ids = (prims: readonly Primitive[]) => prims.map((p) => p.id);
const unique = (prims: readonly Primitive[]) => new Set(ids(prims)).size === prims.length;
const lowest = (prims: readonly Primitive[]) => Math.min(...prims.map((p) => aabbOf(p).min[1]));

describe('placeBuilt and mergeBuilt', () => {
  const b = { prims: [box('b', [10, 5, 0], [2, 2, 2], 'frame')], anchors: { 'x.a': [10, 5, 0] as const }, surfaces: { 'x.s': { kind: 'plane' as const, point: [0, 5, 0] as const, normal: [1, 0, 0] as const } } };
  it('turns about +Y, then moves, prims, anchors and surfaces alike', () => {
    const p = placeBuilt(b, { at: [0, 0, 100], yawDeg: 90 });
    expect(p.anchors['x.a']![0]).toBeCloseTo(0);
    expect(p.anchors['x.a']![2]).toBeCloseTo(90);
    const s = p.surfaces['x.s']!;
    expect(s.kind === 'plane' && s.normal[2]).toBeCloseTo(-1);
  });
  it('refuses duplicate ids', () => {
    expect(() => mergeBuilt(b, b)).toThrow(/duplicate primitive "b"/);
  });
});

describe('implements', () => {
  it('builds a dumbbell centred on the grip along the handle', () => {
    const d = buildDumbbell('d', [0, 50, 0], [0, 0, 1]);
    const a = aabbOf(d.find((p) => p.id === 'd-head-a')!);
    expect(a.max[2]).toBeCloseTo(DUMBBELL.handleLengthCm / 2 + DUMBBELL.headLengthCm);
  });
  it('builds a 2.2 m barbell whose plates reach the floor when it rests on it', () => {
    const b = buildBarbell('b', [0, BARBELL.plateRadiusCm, 0]);
    expect(lowest(b)).toBeCloseTo(0);
    expect(Math.max(...b.map((p) => aabbOf(p).max[0]))).toBeCloseTo(BARBELL.lengthCm / 2);
  });
  it('puts the ab wheel handles where the hands hold them', () => {
    const w = buildAbWheel('w', [0, AB_WHEEL.wheelRadiusCm, 0]);
    expect(lowest(w)).toBeCloseTo(0);
    const grip = w.find((p) => p.id === 'w-grip-a')!;
    expect(grip.kind === 'cylinder' && (grip.start[0] + grip.end[0]) / 2).toBeCloseTo(AB_WHEEL_GRIP_OFFSET_CM);
  });
  it('hangs the rope from a ring toward the pulley', () => {
    const { prims, attach } = buildRope('r', [[10, 100, 0], [-10, 100, 0]], [0, 200, 0]);
    expect(attach[1]).toBeCloseTo(100 + Math.sqrt(ROPE.strandCm ** 2 - 100));
    expect(prims.filter((p) => p.id.startsWith('r-strand'))).toHaveLength(2);
  });
  it('draws a band as two strands per segment and skips zero-length segments', () => {
    expect(buildBand('b', [[0, 0, 0], [0, 0, 0], [10, 0, 0]])).toHaveLength(2);
  });
  it('rests the balls on the floor', () => {
    expect(lowest(buildExerciseBall().prims)).toBeCloseTo(0);
    expect(lowest(buildBalanceTrainer().prims)).toBeCloseTo(0);
  });
});

describe('cardio machines', () => {
  it.each([buildTreadmill, buildRowingMachine, buildExerciseBike].map((f) => [f.name, f] as const))('%s has unique ids and stands on the floor', (_n, build) => {
    const b = build();
    expect(unique(b.prims)).toBe(true);
    expect(lowest(b.prims)).toBeGreaterThanOrEqual(-0.01);
  });
});
