import { type Vec3, add, cross, distance, length, midpoint, normalize, scale, sub } from '../math/vec3';
import { type Built, cyl, cylAlong, sphere } from './built';
import type { Primitive } from './primitives';

/**
 * Hand-held implements and floor accessories (cm). Drawing defaults only — NOT anyone's equipment (D12).
 * Implements are built where the pose puts them: a centre and a unit axis (the handle's length).
 */

export const DUMBBELL = { handleLengthCm: 13, handleRadiusCm: 1.6, headRadiusCm: 5.8, headLengthCm: 6.5 } as const;

/** A round rubber dumbbell centred on the grip, its handle along `axis`. */
export function buildDumbbell(id: string, center: Vec3, axis: Vec3): Primitive[] {
  const u = normalize(axis);
  const off = DUMBBELL.handleLengthCm / 2 + DUMBBELL.headLengthCm / 2;
  return [
    cylAlong(`${id}-handle`, center, u, DUMBBELL.handleLengthCm + 1, DUMBBELL.handleRadiusCm, 'grip'),
    cylAlong(`${id}-head-a`, add(center, scale(u, off)), u, DUMBBELL.headLengthCm, DUMBBELL.headRadiusCm, 'rubber'),
    cylAlong(`${id}-head-b`, add(center, scale(u, -off)), u, DUMBBELL.headLengthCm, DUMBBELL.headRadiusCm, 'rubber'),
  ];
}

/** Standard 2.2 m barbell, 50 mm sleeves, one bumper plate per side. */
export const BARBELL = { lengthCm: 220, shaftHalfCm: 65.5, shaftRadiusCm: 1.4, sleeveRadiusCm: 2.5, plateRadiusCm: 22.5, plateThicknessCm: 6.5 } as const;

export function buildBarbell(id: string, center: Vec3, axis: Vec3 = [1, 0, 0]): Primitive[] {
  const u = normalize(axis);
  const at = (d: number) => add(center, scale(u, d));
  const out: Primitive[] = [cyl(`${id}-shaft`, at(-BARBELL.shaftHalfCm), at(BARBELL.shaftHalfCm), BARBELL.shaftRadiusCm, 'chrome')];
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'a' : 'b';
    out.push(cyl(`${id}-collar-${tag}`, at(s * BARBELL.shaftHalfCm), at(s * (BARBELL.shaftHalfCm + 3)), 3.4, 'chrome'));
    out.push(cyl(`${id}-sleeve-${tag}`, at(s * (BARBELL.shaftHalfCm + 3)), at((s * BARBELL.lengthCm) / 2), BARBELL.sleeveRadiusCm, 'chrome'));
    const p0 = BARBELL.shaftHalfCm + 4;
    out.push(cyl(`${id}-plate-${tag}`, at(s * p0), at(s * (p0 + BARBELL.plateThicknessCm)), BARBELL.plateRadiusCm, 'rubber'));
  }
  return out;
}

/** Ab wheel: a wheel on an axle with a handle each side. */
export const AB_WHEEL = { wheelRadiusCm: 9, wheelWidthCm: 6, handleLengthCm: 11, handleRadiusCm: 1.7 } as const;
/** Distance from the wheel's centre to the middle of each handle. */
export const AB_WHEEL_GRIP_OFFSET_CM = AB_WHEEL.wheelWidthCm / 2 + 1.5 + AB_WHEEL.handleLengthCm / 2;

export function buildAbWheel(id: string, center: Vec3): Primitive[] {
  const u: Vec3 = [1, 0, 0];
  const g = AB_WHEEL_GRIP_OFFSET_CM;
  return [
    cylAlong(`${id}-wheel`, center, u, AB_WHEEL.wheelWidthCm, AB_WHEEL.wheelRadiusCm, 'rubber'),
    cylAlong(`${id}-hub`, center, u, AB_WHEEL.wheelWidthCm + 0.6, 4, 'plastic'),
    cylAlong(`${id}-axle`, center, u, 2 * g + AB_WHEEL.handleLengthCm, 0.8, 'chrome'),
    cylAlong(`${id}-grip-a`, add(center, [g, 0, 0]), u, AB_WHEEL.handleLengthCm, AB_WHEEL.handleRadiusCm, 'grip'),
    cylAlong(`${id}-grip-b`, add(center, [-g, 0, 0]), u, AB_WHEEL.handleLengthCm, AB_WHEEL.handleRadiusCm, 'grip'),
  ];
}

/** A flat resistance band stretched along a path (two thin strands, as a loop band looks side on). */
export function buildBand(id: string, path: readonly Vec3[]): Primitive[] {
  const out: Primitive[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    if (distance(a, b) < 0.5) continue;
    const d = normalize(sub(b, a));
    const side = normalize(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    for (const s of [0.8, -0.8]) out.push(cyl(`${id}-${i}-${s > 0 ? 'a' : 'b'}`, add(a, scale(side, s)), add(b, scale(side, s)), 0.55, 'band'));
  }
  return out;
}

/** A floor accessory's own primitives and anchors, built at the origin (see `placeBuilt`). */
export const FOAM_ROLLER = { radiusCm: 7.5, lengthCm: 90 } as const;
export function buildFoamRoller(): Built {
  const r = FOAM_ROLLER.radiusCm;
  return {
    prims: [cylAlong('foam-roller', [0, r, 0], [1, 0, 0], FOAM_ROLLER.lengthCm, r, 'foam')],
    anchors: { 'foam-roller.top': [0, 2 * r, 0] },
    surfaces: { 'foam-roller': { kind: 'plane', point: [0, 2 * r, 0], normal: [0, 1, 0], primitive: 'foam-roller' } },
  };
}

export const MASSAGE_BALL = { radiusCm: 3.5 } as const;
export function buildMassageBall(): Built {
  const r = MASSAGE_BALL.radiusCm;
  return { prims: [sphere('massage-ball', [0, r, 0], r, 'rubber')], anchors: { 'massage-ball.top': [0, 2 * r, 0] }, surfaces: {} };
}

export const EXERCISE_BALL = { radiusCm: 32.5 } as const;
export function buildExerciseBall(): Built {
  const r = EXERCISE_BALL.radiusCm;
  return {
    prims: [sphere('exercise-ball', [0, r, 0], r, 'ball')],
    anchors: { 'exercise-ball.top': [0, 2 * r, 0], 'exercise-ball.center': [0, r, 0] },
    surfaces: { 'exercise-ball': { kind: 'sphere', center: [0, r, 0], radius: r, primitive: 'exercise-ball' } },
  };
}

/** Half-dome balance trainer: a platform with an inflated dome (a sphere cap) on top. */
export const BALANCE_TRAINER = { baseRadiusCm: 31, platformCm: 4, domeHeightCm: 21 } as const;
export function buildBalanceTrainer(): Built {
  const { baseRadiusCm: a, platformCm: t, domeHeightCm: h } = BALANCE_TRAINER;
  const R = (a * a + h * h) / (2 * h);
  const cy = t + h - R;
  return {
    prims: [cyl('balance-trainer-platform', [0, 0, 0], [0, t, 0], a + 1, 'rubber'), sphere('balance-trainer-dome', [0, cy, 0], R, 'dome', t)],
    anchors: { 'balance-trainer.top': [0, t + h, 0] },
    surfaces: { 'balance-trainer': { kind: 'sphere', center: [0, cy, 0], radius: R, primitive: 'balance-trainer-dome' } },
  };
}

// ── Cable attachments (built between the grips and the cable) ─────────────────

/** Steel cable from the pulley to where the attachment hooks on. */
export const cableLine = (id: string, pulley: Vec3, attach: Vec3): Primitive => cyl(id, pulley, attach, 0.35, 'cable');

/** Where a two-handed attachment hooks on: from the middle of the grips, `reach` cm toward the pulley. */
export function attachPoint(grips: readonly Vec3[], pulley: Vec3, reachCm: number): Vec3 {
  const mid = grips.length === 1 ? grips[0]! : midpoint(grips[0]!, grips[1]!);
  const toward = sub(pulley, mid);
  return length(toward) < 1e-6 ? mid : add(mid, scale(normalize(toward), reachCm));
}

/** Rope: two strands from a ring to a knob beyond each grip. Returns the ring position too. */
export const ROPE = { strandCm: 34, radiusCm: 1.3 } as const;
export function buildRope(id: string, grips: readonly [Vec3, Vec3], pulley: Vec3): { prims: Primitive[]; attach: Vec3 } {
  const half = distance(grips[0], grips[1]) / 2;
  const attach = attachPoint(grips, pulley, Math.sqrt(Math.max(4, ROPE.strandCm ** 2 - half * half)));
  const prims: Primitive[] = [sphere(`${id}-ring`, attach, 1.8, 'chrome')];
  grips.forEach((g, i) => {
    const d = normalize(sub(g, attach));
    const knob = add(g, scale(d, 4.5));
    prims.push(cyl(`${id}-strand-${i}`, attach, knob, ROPE.radiusCm, 'rope'));
    prims.push(sphere(`${id}-knob-${i}`, knob, 2.4, 'rubber'));
  });
  return { prims, attach };
}

/** Single D-handle: a grip across the hand and a frame to the cable. `across` is the hand's width axis. */
export function buildSingleHandle(id: string, grip: Vec3, across: Vec3, pulley: Vec3): { prims: Primitive[]; attach: Vec3 } {
  const u = normalize(across);
  const attach = attachPoint([grip], pulley, 10);
  const ends = [add(grip, scale(u, 6.5)), add(grip, scale(u, -6.5))];
  return {
    prims: [cylAlong(`${id}-grip`, grip, u, 12, 1.7, 'grip'), ...ends.map((e, i) => cyl(`${id}-side-${i}`, e, attach, 0.7, 'chrome')), sphere(`${id}-ring`, attach, 1.4, 'chrome')],
    attach,
  };
}

/** Close-grip (parallel) row handle: two neutral grips side by side, joined and hooked to the cable. */
export function buildCloseGripHandle(id: string, grips: readonly [Vec3, Vec3], across: readonly [Vec3, Vec3], pulley: Vec3): { prims: Primitive[]; attach: Vec3 } {
  const attach = attachPoint(grips, pulley, 16);
  const prims: Primitive[] = [];
  grips.forEach((g, i) => {
    const u = normalize(across[i]!);
    prims.push(cylAlong(`${id}-grip-${i}`, g, u, 11, 1.7, 'grip'));
    for (const s of [1, -1]) prims.push(cyl(`${id}-frame-${i}-${s > 0 ? 'a' : 'b'}`, add(g, scale(u, s * 6)), attach, 0.9, 'frame'));
  });
  prims.push(sphere(`${id}-ring`, attach, 1.4, 'chrome'));
  return { prims, attach };
}

/** Lat pulldown bar: straight between the grips, with ends angled down, hooked on at its middle. */
export function buildLatBar(id: string, grips: readonly [Vec3, Vec3], pulley: Vec3): { prims: Primitive[]; attach: Vec3 } {
  const u = normalize(sub(grips[0], grips[1]));
  const mid = midpoint(grips[0], grips[1]);
  const half = distance(grips[0], grips[1]) / 2 + 12;
  const up = normalize(sub(pulley, mid));
  const down = scale(up, -1);
  const endA = add(mid, scale(u, half));
  const endB = add(mid, scale(u, -half));
  const attach = add(mid, scale(up, 6));
  return {
    prims: [
      cyl(`${id}-bar`, endA, endB, 1.4, 'chrome'),
      cyl(`${id}-end-a`, endA, add(add(endA, scale(u, 10)), scale(down, 9)), 1.4, 'chrome'),
      cyl(`${id}-end-b`, endB, add(add(endB, scale(u, -10)), scale(down, 9)), 1.4, 'chrome'),
      cyl(`${id}-hook`, mid, attach, 0.9, 'chrome'),
    ],
    attach,
  };
}

/** Ankle strap: a cuff around the ankle (`along` = the shank direction) with a D-ring toward the cable. */
export function buildAnkleStrap(id: string, ankle: Vec3, along: Vec3, pulley: Vec3): { prims: Primitive[]; attach: Vec3 } {
  const u = normalize(along);
  const attach = attachPoint([ankle], pulley, 8);
  return { prims: [cylAlong(`${id}-cuff`, add(ankle, scale(u, 4)), u, 7, 5.2, 'band'), cyl(`${id}-ring`, add(ankle, scale(u, 4)), attach, 0.6, 'chrome')], attach };
}
