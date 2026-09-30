import type { Vec3 } from '../math/vec3';
import { degToRad, fromAxisAngle } from '../math/quat';
import { box, type Built, cyl } from './built';
import type { Primitive } from './primitives';
import { buildSmith, catchHeightFor, ILLUSTRATIVE_SMITH, type SmithParams } from './smith';

/** Pulley settings, in words (spec §5.1: no hole numbers). */
export type PulleyHeight = 'high' | 'chest' | 'low';
export type ColumnSide = 'left' | 'right';

/**
 * The Smith machine + functional trainer (cm): the Smith rack of `SmithParams` plus a pulley carriage on
 * each front upright, a weight stack beside each side, a pull-up bar across the front, and the optional
 * J-hooks, spotter arms, roller hold-down and seated-row footplate.
 */
export interface TrainerParams extends SmithParams {
  /** Floor to the top of the pull-up bar (content parameter `pullUpBarHeightCm`). */
  pullUpBarHeightCm: number;
  /** How far the pull-up bar sits in front of the front uprights' centre line. */
  pullUpBarForwardCm: number;
  pullUpBarRadiusCm: number;
  /** Height of the pulley wheel's centre for each setting. */
  pulleyHeightsCm: Readonly<Record<PulleyHeight, number>>;
  pulleyRadiusCm: number;
  /** Top of the roller hold-down's kneeling pad. */
  holdDownPadTopCm: number;
}

/**
 * Drawing defaults — NOT measurements of anyone's machine (D12). The Smith part is `ILLUSTRATIVE_SMITH`;
 * the pull-up bar height equals the content's illustrative `pullUpBarHeightCm` (210).
 */
export const ILLUSTRATIVE_TRAINER: TrainerParams = {
  ...ILLUSTRATIVE_SMITH,
  pullUpBarHeightCm: 210,
  pullUpBarForwardCm: 16,
  pullUpBarRadiusCm: 1.6,
  pulleyHeightsCm: { high: 195, chest: 125, low: 22 },
  pulleyRadiusCm: 5,
  holdDownPadTopCm: 30,
};

export interface TrainerState {
  /** Draw the Smith bar, plates and carriages at this bar-centre height; omit to leave them to the pose (moving props). */
  barHeightCm?: number;
  /** Bar height at which the safety catches stop the bar; omit to draw no catches. */
  catchHeightCm?: number;
  /** Where each pulley carriage is set (default: both low). */
  pulleys?: Partial<Record<ColumnSide, PulleyHeight>>;
  jHookHeightCm?: number;
  spotterArmHeightCm?: number;
  holdDown?: boolean;
  footplate?: boolean;
}

/** X of the front uprights' centre lines, left (+X) and right (−X). */
export const uprightX = (p: SmithParams): number => p.rackInnerWidthCm / 2 + p.uprightSizeCm / 2;
/** Z of the front uprights' centre line. */
export const frontZ = (p: SmithParams): number => p.rackInnerDepthCm / 2 + p.uprightSizeCm / 2;
const sideSign = (s: ColumnSide) => (s === 'left' ? 1 : -1);

/** Centre of the pulley wheel of one column at a setting (it hangs in front of the upright). */
export function pulleyPoint(p: TrainerParams, side: ColumnSide, height: PulleyHeight): Vec3 {
  return [sideSign(side) * uprightX(p), p.pulleyHeightsCm[height], frontZ(p) + p.uprightSizeCm / 2 + 7];
}

const MOVING = /^(bar$|plate-|carriage-)/;

/** The Smith machine's own dimensions out of a trainer description (what `buildSmith` checks and draws). */
export function smithPart(p: SmithParams): SmithParams {
  return Object.fromEntries((Object.keys(ILLUSTRATIVE_SMITH) as Array<keyof SmithParams>).map((k) => [k, p[k]])) as unknown as SmithParams;
}

/** The Smith bar, plates and carriages at a bar height (the parts that move with the bar). */
export function smithMovingParts(p: SmithParams, barHeightCm: number): Primitive[] {
  return buildSmith(smithPart(p), { barHeightCm }).filter((q) => MOVING.test(q.id));
}

/** Everything wrong with a trainer description, as sentences (empty when it can be drawn). */
export function trainerProblems(p: TrainerParams): string[] {
  const out: string[] = [];
  const top = p.rackHeightCm - p.uprightSizeCm;
  if (!(p.pullUpBarHeightCm >= 100 && p.pullUpBarHeightCm <= p.rackHeightCm + 20)) {
    out.push(`pull-up bar at ${p.pullUpBarHeightCm} cm must be between 100 cm and 20 cm above the rack top`);
  }
  for (const [k, h] of Object.entries(p.pulleyHeightsCm)) {
    if (!(h - p.pulleyRadiusCm > 0 && h + p.pulleyRadiusCm < top)) out.push(`pulley "${k}" at ${h} cm must sit on the upright (0–${top} cm)`);
  }
  if (!(p.pulleyHeightsCm.low < p.pulleyHeightsCm.chest && p.pulleyHeightsCm.chest < p.pulleyHeightsCm.high)) out.push('pulley heights must rise from low to chest to high');
  if (!(p.holdDownPadTopCm >= 20 && p.holdDownPadTopCm <= 90)) out.push(`hold-down pad at ${p.holdDownPadTopCm} cm must be between 20 and 90 cm`);
  return out;
}

/**
 * The trainer's primitives, anchors and surfaces. Anchors: `smith.rail` (floor point on the bar path),
 * `smith.bar` (bar centre, when drawn), `smith.catch` (the bar height the catches stop, when drawn), `pullup.bar` (bar centre), `cable.<side>.<height>` (pulley wheel
 * centres), `hold-down.pad` (top centre of the pad), `hold-down.roller` (roller axis centre), `footplate`
 * (plate face centre). Surfaces: `hold-down.pad`, `footplate`.
 */
export function buildTrainer(p: TrainerParams, state: TrainerState = {}): Built {
  const problems = trainerProblems(p);
  if (problems.length) throw new Error(`buildTrainer: ${problems.join('; ')}`);
  const bar = state.barHeightCm ?? (p.lowestBarHeightCm + p.highestBarHeightCm) / 2;
  const smith = buildSmith(smithPart(p), { barHeightCm: bar, catchHeightCm: state.catchHeightCm });
  const prims = state.barHeightCm === undefined ? smith.filter((q) => !MOVING.test(q.id)) : smith;
  const u = p.uprightSizeCm;
  const X = uprightX(p);
  const Z = frontZ(p);
  const anchors: Record<string, Vec3> = { 'smith.rail': [0, 0, p.railZCm] };
  if (state.barHeightCm !== undefined) anchors['smith.bar'] = [0, bar, p.railZCm];
  if (state.catchHeightCm !== undefined) anchors['smith.catch'] = [0, state.catchHeightCm, p.railZCm];

  // Pull-up bar across the front, on two brackets from the front top beam.
  const pz = Z + p.pullUpBarForwardCm;
  const py = p.pullUpBarHeightCm - p.pullUpBarRadiusCm;
  prims.push(cyl('pullup-bar', [X + u / 2, py, pz], [-X - u / 2, py, pz], p.pullUpBarRadiusCm, 'chrome'));
  for (const s of [1, -1]) {
    prims.push(box(`pullup-bracket-${s > 0 ? 'left' : 'right'}`, [s * X, (py + p.rackHeightCm - u / 2) / 2, (Z + pz) / 2], [u * 0.6, p.rackHeightCm - u / 2 - py + 4, pz - Z], 'frame'));
  }
  anchors['pullup.bar'] = [0, py, pz];

  // A pulley carriage on each front upright, and a weight stack beside each side.
  for (const side of ['left', 'right'] as const) {
    const s = sideSign(side);
    const height = state.pulleys?.[side] ?? 'low';
    const wheel = pulleyPoint(p, side, height);
    prims.push(box(`pulley-carriage-${side}`, [wheel[0], wheel[1] + 3, Z + u / 2 + 2.5], [u + 2, 16, 5], 'carriage'));
    prims.push(cyl(`pulley-${side}`, [wheel[0] - 1.4, wheel[1], wheel[2]], [wheel[0] + 1.4, wheel[1], wheel[2]], p.pulleyRadiusCm, 'chrome'));
    prims.push(box(`pulley-fork-${side}`, [wheel[0], wheel[1] + p.pulleyRadiusCm + 1, (Z + u / 2 + wheel[2]) / 2], [4, 2, wheel[2] - Z - u / 2 + 1], 'frame'));
    for (const h of ['high', 'chest', 'low'] as const) anchors[`cable.${side}.${h}`] = pulleyPoint(p, side, h);
    const sx = s * (X + u / 2 + 22);
    // The stack's head frame sits at the height of the side top beam; its arm meets that beam's outer face, and a floor tie joins the stack base to the side base.
    const headY = p.rackHeightCm - u / 2;
    const stackTop = headY - 2.5;
    for (const dz of [-16, 16]) prims.push(box(`stack-post-${side}-${dz > 0 ? 'front' : 'back'}`, [sx, stackTop / 2, dz], [5, stackTop, 5], 'frame'));
    prims.push(box(`stack-top-${side}`, [sx, headY, 0], [8, 5, 37], 'frame'));
    prims.push(box(`stack-base-${side}`, [sx, 2.5, 0], [30, 5, 45], 'frame'));
    prims.push(box(`stack-plates-${side}`, [sx, 5 + 32, 0], [26, 64, 18], 'plate'));
    for (const dz of [-8, 8]) prims.push(cyl(`stack-rod-${side}-${dz > 0 ? 'front' : 'back'}`, [sx, 5, dz], [sx, stackTop, dz], 1, 'chrome'));
    prims.push(box(`stack-arm-${side}`, [(sx + s * (X + u / 2)) / 2, headY, 0], [Math.abs(sx) - X - u / 2, 5, 6], 'frame'));
    prims.push(box(`stack-tie-${side}`, [s * (X + u / 2 + 4), 2.5, 0], [8, 5, 6], 'frame'));
  }

  if (state.jHookHeightCm !== undefined) {
    for (const s of [1, -1]) prims.push(box(`jhook-${s > 0 ? 'left' : 'right'}`, [s * (X - u / 2 - 2), state.jHookHeightCm, Z], [4, 8, 6], 'rubber'));
  }
  if (state.spotterArmHeightCm !== undefined) {
    for (const s of [1, -1]) {
      const side = s > 0 ? 'left' : 'right';
      // The arm runs along the inside faces of the uprights, clear of the Smith rail and carriage, hung from a sleeve around each upright.
      prims.push(box(`spotter-${side}`, [s * (X - u / 2 - 2.5), state.spotterArmHeightCm, 0], [5, 5, 2 * Z + 20], 'frame'));
      for (const z of [Z, -Z]) {
        prims.push(box(`spotter-sleeve-${side}-${z > 0 ? 'front' : 'back'}`, [s * (X - 1), state.spotterArmHeightCm, z], [u + 2 + 2, 8, u + 2], 'frame'));
      }
    }
  }

  const surfaces: Built['surfaces'] = {};
  if (state.holdDown) {
    // Fixed kneeling pad pinned to a front upright (the right one here), sticking out forward; rollers over its back end.
    const x = -X + u / 2 + 14;
    const top = p.holdDownPadTopCm;
    const zBack = Z + u / 2 + 18;
    const len = 54;
    const rollerZ = zBack + 1;
    const rollerY = top + 15;
    prims.push(box('hold-down-sleeve', [-X, top - 6, Z], [u + 3, 22, u + 3], 'frame'));
    prims.push(box('hold-down-arm', [(x - X) / 2, top - 10, Z + u / 2 + 3], [x + X + 6, 6, 6], 'frame'));
    prims.push(box('hold-down-rail', [x, top - 10, (Z + u / 2 + zBack + len) / 2], [6, 6, zBack + len - Z - u / 2], 'frame'));
    prims.push(box('hold-down-pad', [x, top - 3.5, zBack + len / 2], [32, 7, len], 'pad'));
    prims.push(box('hold-down-post', [x, (top + rollerY) / 2 - 3, rollerZ - 7], [4, rollerY - top + 12, 4], 'frame'));
    prims.push(box('hold-down-roller-arm', [x, rollerY, rollerZ - 3.5], [4, 4, 11], 'frame'));
    prims.push(cyl('hold-down-roller', [x - 15, rollerY, rollerZ], [x + 15, rollerY, rollerZ], 4.5, 'pad'));
    anchors['hold-down.pad'] = [x, top, zBack + len / 2];
    anchors['hold-down.roller'] = [x, rollerY, rollerZ];
    surfaces['hold-down.pad'] = { kind: 'plane', point: [x, top, zBack + len / 2], normal: [0, 1, 0], primitive: 'hold-down-pad' };
  }
  if (state.footplate) {
    // Seated-row footplate at the base of a column (the left one here), leaning back 20°; the cable runs through its notch.
    const tilt = fromAxisAngle([1, 0, 0], degToRad(-20));
    const c: Vec3 = [X - 2, 17, Z + u / 2 + 9];
    prims.push(box('footplate', c, [38, 30, 2.5], 'frame', tilt));
    prims.push(box('footplate-base', [X - 2, 2, Z + u / 2 + 6], [38, 4, 14], 'frame'));
    const normal: Vec3 = [0, Math.sin(degToRad(20)), Math.cos(degToRad(20))];
    const face: Vec3 = [c[0] + normal[0] * 1.25, c[1] + normal[1] * 1.25, c[2] + normal[2] * 1.25];
    anchors['footplate'] = face;
    surfaces['footplate'] = { kind: 'plane', point: face, normal, primitive: 'footplate' };
  }
  return { prims, anchors, surfaces };
}

/** Catch height for a set whose lowest bar position is `lowestRepBarCm` (re-exported for scenes). */
export { catchHeightFor };
