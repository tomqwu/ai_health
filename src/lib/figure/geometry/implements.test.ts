import { describe, expect, it } from 'vitest';
import { type Vec3, add, distance, length, scale } from '../math/vec3';
import { degToRad, fromAxisAngle, rotate } from '../math/quat';
import { box, type Built, cyl, mergeBuilt, placeBuilt, sphere } from './built';
import { BIKE, buildExerciseBike, buildRowingMachine, buildTreadmill, ROWER, TREADMILL } from './cardio';
import {
  AB_WHEEL,
  AB_WHEEL_GRIP_OFFSET_CM,
  BARBELL,
  attachPoint,
  BALANCE_TRAINER,
  buildAbWheel,
  buildAnkleStrap,
  buildBalanceTrainer,
  buildBand,
  buildBarbell,
  buildCloseGripHandle,
  buildDumbbell,
  buildExerciseBall,
  buildFoamRoller,
  buildLatBar,
  buildMassageBall,
  buildRope,
  buildSingleHandle,
  cableLine,
  DUMBBELL,
  EXERCISE_BALL,
  FOAM_ROLLER,
  MASSAGE_BALL,
  ROPE,
} from './implements';
import { aabbOf, type Primitive, signedDistance } from './primitives';

const ids = (prims: readonly Primitive[]) => prims.map((p) => p.id);
const unique = (prims: readonly Primitive[]) => new Set(ids(prims)).size === prims.length;
const lowest = (prims: readonly Primitive[]) => Math.min(...prims.map((p) => aabbOf(p).min[1]));

/** Points filling a primitive (its volume and surface), for touch checks that bounding boxes cannot make. */
function cloud(p: Primitive): Vec3[] {
  const out: Vec3[] = [];
  if (p.kind === 'box') {
    const n = 8;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        for (let k = 0; k <= n; k++) {
          const local: Vec3 = [((i / n - 0.5) * p.size[0]), ((j / n - 0.5) * p.size[1]), ((k / n - 0.5) * p.size[2])];
          out.push(add(p.center, p.rotation ? rotate(p.rotation, local) : local));
        }
      }
    }
    return out;
  }
  if (p.kind === 'sphere') {
    for (const f of [0, 0.5, 1]) for (const dir of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) out.push(add(p.center, scale(dir, f * p.radius)));
    return p.capBelowY === undefined ? out : out.filter((v) => v[1] >= p.capBelowY!);
  }
  const axis = add(p.end, scale(p.start, -1));
  const h = length(axis);
  const u = scale(axis, 1 / h);
  const ref: Vec3 = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const s = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]] as const;
  const sn = scale(s, 1 / length(s));
  const t2: Vec3 = [u[1] * sn[2] - u[2] * sn[1], u[2] * sn[0] - u[0] * sn[2], u[0] * sn[1] - u[1] * sn[0]];
  for (let i = 0; i <= 12; i++) {
    const c = add(p.start, scale(axis, i / 12));
    out.push(c);
    for (const f of [0.5, 1]) for (let a = 0; a < 8; a++) out.push(add(c, add(scale(sn, Math.cos((a * Math.PI) / 4) * f * p.radius), scale(t2, Math.sin((a * Math.PI) / 4) * f * p.radius))));
  }
  return out;
}

/** Smallest distance between two primitives' surfaces (negative once they overlap), from their point clouds. */
const gap = (a: Primitive, b: Primitive): number => Math.min(...cloud(a).map((v) => signedDistance(b, v)), ...cloud(b).map((v) => signedDistance(a, v)));

const TOUCH_CM = 0.3;

/** Ids of the primitives not joined to the first one through a chain of touching parts (a part hanging in the air, or a sub-assembly not mounted on the rest). */
function detached(prims: readonly Primitive[]): string[] {
  const done = new Set<number>([0]);
  const queue = [0];
  while (queue.length > 0) {
    const a = queue.pop()!;
    prims.forEach((p, i) => {
      if (!done.has(i) && gap(prims[a]!, p) <= TOUCH_CM) {
        done.add(i);
        queue.push(i);
      }
    });
  }
  return prims.filter((_, i) => !done.has(i)).map((p) => p.id);
}

const cylinderOf = (prims: readonly Primitive[], id: string) => {
  const p = prims.find((q) => q.id === id)!;
  if (p.kind !== 'cylinder') throw new Error(`${id} is not a cylinder`);
  return p;
};
const at = (v: Vec3 | undefined): number[] => [...v!];
const close = (v: Vec3 | undefined, e: readonly number[]) => e.forEach((x, i) => expect(v![i]).toBeCloseTo(x, 6));

describe('placeBuilt and mergeBuilt', () => {
  const tilt = fromAxisAngle([1, 0, 0], degToRad(30));
  const b: Built = {
    prims: [
      box('tilted', [10, 5, 0], [4, 2, 6], 'frame', tilt),
      box('flat', [-10, 5, 20], [2, 2, 2], 'frame'),
      cyl('rod', [0, 1, 0], [5, 1, 30], 1, 'frame'),
      sphere('dome', [3, 10, 4], 12, 'dome', 4),
      sphere('ball', [3, 10, 4], 2, 'ball'),
    ],
    anchors: { 'x.a': [10, 5, 0] },
    surfaces: {
      'x.s': { kind: 'plane', point: [0, 5, 0], normal: [1, 0, 0], primitive: 'flat' },
      'x.ball': { kind: 'sphere', center: [3, 10, 4], radius: 2, primitive: 'ball' },
    },
  };
  const yaw = 90;
  const at0: Vec3 = [7, 3, 100];
  const p = placeBuilt(b, { at: at0, yawDeg: yaw });
  const q = fromAxisAngle([0, 1, 0], degToRad(yaw));
  const toWorld = (v: Vec3): Vec3 => add(rotate(q, v), at0);
  const prim = (id: string) => p.prims.find((x) => x.id === id)!;

  it('turns about +Y (a quarter turn sends +x to -z), then moves anchors', () => {
    close(p.anchors['x.a'], [7, 8, 90]);
  });
  it('moves and keeps the size of boxes, and composes the yaw with the box rotation', () => {
    const t = prim('tilted');
    expect(t.kind === 'box' && t.size).toEqual([4, 2, 6]);
    close(t.kind === 'box' ? t.center : undefined, [7, 8, 90]);
    // A rigid move keeps every signed distance: a point and its image are equally far from the box.
    for (const pt of [[10, 5, 0], [10, 5.9, 2.6], [12.5, 5, 0], [10, 8, 4], [10, 5, -3.2], [14, 9, 3]] as const) {
      expect(signedDistance(t, toWorld(pt))).toBeCloseTo(signedDistance(b.prims[0]!, pt), 6);
    }
    const f = prim('flat');
    for (const pt of [[-10, 5, 20], [-10, 6.5, 20], [-8.5, 5, 20], [-10, 5, 22]] as const) expect(signedDistance(f, toWorld(pt))).toBeCloseTo(signedDistance(b.prims[1]!, pt), 6);
    expect(f.kind === 'box' && f.rotation).toBeDefined();
  });
  it('without a yaw, invents no rotation and leaves the tilt alone', () => {
    const still = placeBuilt(b, { at: [0, 0, 0] });
    expect(still.prims[0]).toEqual(b.prims[0]);
    expect(still.prims[1]).toEqual(b.prims[1]);
  });
  it('moves both ends of a cylinder', () => {
    const r = cylinderOf(p.prims, 'rod');
    close(r.start, [7, 4, 100]);
    close(r.end, [37, 4, 95]);
    expect(r.radius).toBe(1);
  });
  it('lifts the cut of a capped sphere with the sphere', () => {
    const lifted = placeBuilt(b, { at: [0, 6, 0] });
    const s = lifted.prims.find((x) => x.id === 'dome')!;
    expect(s.kind === 'sphere' && s.capBelowY).toBe(10);
    expect(s.kind === 'sphere' && s.center[1]).toBe(16);
    const uncut = lifted.prims.find((x) => x.id === 'ball')!;
    expect(uncut.kind === 'sphere' && uncut.capBelowY).toBeUndefined();
    for (const pt of [[3, 22, 4], [3, 5, 4], [3, 6, 4], [14, 5, 4], [3, 1, 4], [15, 10, 4]] as const) {
      expect(signedDistance(s, add(pt, [0, 6, 0]))).toBeCloseTo(signedDistance(b.prims[3]!, pt), 6);
    }
  });
  it('carries surfaces: a plane turns its normal, a sphere moves its centre, both keep their primitive', () => {
    const s = p.surfaces['x.s']!;
    expect(s.kind).toBe('plane');
    if (s.kind === 'plane') {
      close(s.point, [7, 8, 100]);
      close(s.normal, [0, 0, -1]);
      expect(s.primitive).toBe('flat');
    }
    const ball = p.surfaces['x.ball']!;
    expect(ball.kind).toBe('sphere');
    if (ball.kind === 'sphere') {
      close(ball.center, [7 + 4, 13, 100 - 3]);
      expect(ball.radius).toBe(2);
      expect(ball.primitive).toBe('ball');
    }
  });
  it('refuses duplicate primitives, anchors and surfaces', () => {
    expect(() => mergeBuilt(b, b)).toThrow(/duplicate primitive "tilted"/);
    const solo = (extra: Partial<Built>): Built => ({ prims: [], anchors: {}, surfaces: {}, ...extra });
    expect(() => mergeBuilt(solo({ anchors: { k: [0, 0, 0] } }), solo({ anchors: { k: [1, 1, 1] } }))).toThrow(/duplicate anchor "k"/);
    const plane = { kind: 'plane' as const, point: [0, 0, 0] as const, normal: [0, 1, 0] as const };
    expect(() => mergeBuilt(solo({ surfaces: { s: plane } }), solo({ surfaces: { s: plane } }))).toThrow(/duplicate surface "s"/);
    const merged = mergeBuilt(solo({ anchors: { a: [0, 0, 0] } }), solo({ anchors: { b: [1, 1, 1] } }));
    expect(Object.keys(merged.anchors)).toEqual(['a', 'b']);
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

describe('floor accessories', () => {
  it('rests the foam roller on the floor and exposes its top', () => {
    const r = buildFoamRoller();
    expect(lowest(r.prims)).toBeCloseTo(0);
    expect(unique(r.prims)).toBe(true);
    expect(aabbOf(r.prims[0]!).max[0]).toBeCloseTo(FOAM_ROLLER.lengthCm / 2);
    close(r.anchors['foam-roller.top'], [0, 2 * FOAM_ROLLER.radiusCm, 0]);
    expect(r.surfaces['foam-roller']).toEqual({ kind: 'plane', point: [0, 15, 0], normal: [0, 1, 0], primitive: 'foam-roller' });
    expect(r.prims.some((p) => p.id === 'foam-roller')).toBe(true);
  });
  it('rests the massage ball on the floor and exposes its top', () => {
    const m = buildMassageBall();
    expect(lowest(m.prims)).toBeCloseTo(0);
    expect(aabbOf(m.prims[0]!).max[1]).toBeCloseTo(2 * MASSAGE_BALL.radiusCm);
    close(m.anchors['massage-ball.top'], [0, 7, 0]);
    expect(m.surfaces).toEqual({});
  });
  it('gives the exercise ball its top, centre and a sphere surface that matches the drawn ball', () => {
    const e = buildExerciseBall();
    close(e.anchors['exercise-ball.top'], [0, 65, 0]);
    close(e.anchors['exercise-ball.center'], [0, 32.5, 0]);
    expect(e.surfaces['exercise-ball']).toEqual({ kind: 'sphere', center: [0, 32.5, 0], radius: EXERCISE_BALL.radiusCm, primitive: 'exercise-ball' });
    expect(signedDistance(e.prims[0]!, e.anchors['exercise-ball.top']!)).toBeCloseTo(0);
  });
  it('gives the balance trainer a dome that meets its platform at the rim and peaks at the top anchor', () => {
    const t = buildBalanceTrainer();
    const { baseRadiusCm: a, platformCm: h0, domeHeightCm: h } = BALANCE_TRAINER;
    close(t.anchors['balance-trainer.top'], [0, h0 + h, 0]);
    const dome = t.prims.find((p) => p.id === 'balance-trainer-dome')!;
    expect(signedDistance(dome, t.anchors['balance-trainer.top']!)).toBeCloseTo(0);
    expect(signedDistance(dome, [a, h0, 0])).toBeCloseTo(0);
    const s = t.surfaces['balance-trainer']!;
    expect(s.kind === 'sphere' && s.primitive).toBe('balance-trainer-dome');
    expect(s.kind === 'sphere' && distance(s.center, t.anchors['balance-trainer.top']!)).toBeCloseTo(s.kind === 'sphere' ? s.radius : NaN);
    expect(detached(t.prims)).toEqual([]);
  });
});

describe('cable attachments', () => {
  const pulley: Vec3 = [0, 200, 0];
  it('finds where a two-handed attachment hooks on', () => {
    close(attachPoint([[-10, 100, 0], [10, 100, 0]], pulley, 16), [0, 116, 0]);
    close(attachPoint([[0, 100, 0]], pulley, 10), [0, 110, 0]);
    close(attachPoint([[0, 200, 0]], pulley, 10), [0, 200, 0]);
  });
  it('draws the cable as a thin cylinder to the hook', () => {
    const c = cableLine('c', pulley, [0, 116, 0]);
    expect(c.kind).toBe('cylinder');
    expect(c.kind === 'cylinder' && [c.start, c.end]).toEqual([pulley, [0, 116, 0]]);
  });
  it('builds a rope: a ring at the reach distance, a strand and knob past each grip', () => {
    const grips: readonly [Vec3, Vec3] = [[10, 100, 0], [-10, 100, 0]];
    const { prims, attach } = buildRope('r', grips, pulley);
    expect(unique(prims)).toBe(true);
    expect(prims).toHaveLength(5);
    expect(distance(attach, grips[0])).toBeCloseTo(ROPE.strandCm);
    const strand = cylinderOf(prims, 'r-strand-0');
    close(strand.start, at(attach));
    expect(distance(strand.end, grips[0])).toBeCloseTo(4.5);
    expect(detached(prims)).toEqual([]);
  });
  it('builds a single D-handle: a grip across the hand, hooked 10 cm toward the cable', () => {
    const { prims, attach } = buildSingleHandle('h', [0, 100, 0], [1, 0, 0], pulley);
    close(attach, [0, 110, 0]);
    expect(unique(prims)).toBe(true);
    const grip = cylinderOf(prims, 'h-grip');
    close(grip.start, [-6, 100, 0]);
    close(grip.end, [6, 100, 0]);
    expect(prims.filter((p) => p.id.startsWith('h-side'))).toHaveLength(2);
    expect(detached(prims)).toEqual([]);
  });
  it('builds a close-grip handle: two grips, each framed to a shared ring', () => {
    const { prims, attach } = buildCloseGripHandle('c', [[-5, 100, 0], [5, 100, 0]], [[0, 0, 1], [0, 0, 1]], pulley);
    close(attach, [0, 116, 0]);
    expect(unique(prims)).toBe(true);
    expect(prims.filter((p) => p.id.startsWith('c-frame'))).toHaveLength(4);
    const g = cylinderOf(prims, 'c-grip-1');
    close(g.start, [5, 100, -5.5]);
    close(g.end, [5, 100, 5.5]);
    expect(detached(prims)).toEqual([]);
  });
  it('builds a lat bar that runs past the grips, angles down at the ends and hooks on at the middle', () => {
    const { prims, attach } = buildLatBar('l', [[-40, 100, 0], [40, 100, 0]], pulley);
    close(attach, [0, 106, 0]);
    expect(unique(prims)).toBe(true);
    const bar = cylinderOf(prims, 'l-bar');
    expect(Math.abs(bar.start[0] - bar.end[0])).toBeCloseTo(104);
    const a = cylinderOf(prims, 'l-end-a');
    expect(a.end[1]).toBeCloseTo(91);
    expect(Math.abs(a.end[0])).toBeCloseTo(62);
    expect(detached(prims)).toEqual([]);
  });
  it('builds an ankle strap: a cuff along the shank and a ring toward the cable', () => {
    const { prims, attach } = buildAnkleStrap('s', [0, 10, 0], [0, 1, 0], pulley);
    close(attach, [0, 18, 0]);
    expect(unique(prims)).toBe(true);
    const cuff = cylinderOf(prims, 's-cuff');
    close(cuff.start, [0, 10.5, 0]);
    close(cuff.end, [0, 17.5, 0]);
    expect(cuff.radius).toBe(5.2);
    expect(detached(prims)).toEqual([]);
  });
  it('refuses a degenerate axis', () => {
    expect(() => buildSingleHandle('h', [0, 0, 0], [0, 0, 0], pulley)).toThrow();
  });
});

describe('cardio machines', () => {
  it.each([buildTreadmill, buildRowingMachine, buildExerciseBike].map((f) => [f.name, f] as const))('%s has unique ids and stands on the floor', (_n, build) => {
    const b = build();
    expect(unique(b.prims)).toBe(true);
    expect(lowest(b.prims)).toBeGreaterThanOrEqual(-0.01);
  });
  it.each([buildTreadmill, buildRowingMachine, buildExerciseBike].map((f) => [f.name, f] as const))('%s is one connected piece: every part touches the others, none floats or hangs unsupported', (_n, build) => {
    expect(detached(build().prims)).toEqual([]);
  });
  it('the connectivity check catches a part in the air and a part standing apart on the floor', () => {
    const b = buildTreadmill();
    expect(detached([...b.prims, box('ghost', [0, 150, 0], [5, 5, 5], 'frame')])).toEqual(['ghost']);
    expect(detached([...b.prims, box('stray-foot', [90, 2, 0], [5, 4, 5], 'frame')])).toEqual(['stray-foot']);
  });

  it('puts the belt flush on the deck and the belt anchor on the belt', () => {
    const t = buildTreadmill();
    const belt = t.prims.find((p) => p.id === 'treadmill-belt')!;
    const deck = t.prims.find((p) => p.id === 'treadmill-deck')!;
    expect(aabbOf(deck).max[1]).toBeCloseTo(TREADMILL.deckTopCm);
    expect(aabbOf(belt).min[1]).toBeCloseTo(aabbOf(deck).max[1]);
    close(t.anchors['treadmill.belt'], [0, TREADMILL.deckTopCm + 1, -8]);
    expect(signedDistance(belt, t.anchors['treadmill.belt']!)).toBeCloseTo(0);
    expect(t.surfaces['treadmill.belt']).toEqual({ kind: 'plane', point: [0, 23, -8], normal: [0, 1, 0], primitive: 'treadmill-belt' });
    for (const tag of ['left', 'right']) expect(Math.abs(aabbOf(t.prims.find((p) => p.id === `treadmill-rail-${tag}`)!).max[0])).toBeLessThanOrEqual(TREADMILL.widthCm / 2 - 3);
  });

  it('sizes the rower fan like an air rower cage (about 37 cm across) and seats the rower on its rail', () => {
    const r = buildRowingMachine();
    expect(ROWER.fanRadiusCm * 2).toBeGreaterThanOrEqual(35);
    expect(ROWER.fanRadiusCm * 2).toBeLessThanOrEqual(40);
    const fan = cylinderOf(r.prims, 'rower-fan');
    expect(fan.radius).toBe(ROWER.fanRadiusCm);
    const seat = r.prims.find((p) => p.id === 'rower-seat')!;
    expect(aabbOf(seat).min[1]).toBeCloseTo(ROWER.railTopCm);
    close(r.anchors['rower.seat'], [0, ROWER.railTopCm + 6, -10]);
    close(r.anchors['rower.handle'], [0, 48, ROWER.fanZCm - 38]);
    close(r.anchors['rower.footplates'], [0, ROWER.railTopCm + 6, ROWER.fanZCm - 60]);
    expect(r.surfaces['rower.seat']).toEqual({ kind: 'plane', point: [0, 44, -10], normal: [0, 1, 0], primitive: 'rower-seat' });
    expect(aabbOf(seat).max[1]).toBeCloseTo(44);
  });

  it('mounts the bike crank on a tube and the saddle on the seat tube', () => {
    const b = buildExerciseBike();
    close(b.anchors['bike.saddle'], [0, BIKE.saddleTopCm, -22]);
    close(b.anchors['bike.handlebars'], [0, 108, 36]);
    close(b.anchors['bike.crank'], [0, 32, 2]);
    const axle = b.prims.find((p) => p.id === 'bike-crank-axle')!;
    const frame = b.prims.filter((p) => p.surface === 'frame');
    expect(Math.min(...frame.map((p) => gap(axle, p)))).toBeLessThanOrEqual(0);
    const saddle = b.prims.find((p) => p.id === 'bike-saddle')!;
    expect(aabbOf(saddle).max[1]).toBeCloseTo(BIKE.saddleTopCm);
    expect(gap(saddle, b.prims.find((p) => p.id === 'bike-seat-tube')!)).toBeLessThanOrEqual(0);
    expect(b.surfaces).toEqual({});
  });
});
