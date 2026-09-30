import { type Vec3, add, angleBetweenDeg, distance, length, scale, sub, Y_AXIS } from '../math/vec3';
import { conjugate, rotate } from '../math/quat';
import type { SmithParams } from '../geometry/smith';
import type { Side } from './hands';
import { type SkeletonDef, type WorldPose, restPose } from './skeleton';
import type { SmithSquatSolution } from './smithSquat';

export type Severity = 'error' | 'warn';

export interface Finding {
  check: 'anchor' | 'feet-flat' | 'bar-on-rail' | 'bar-travel' | 'bone-length' | 'rom' | 'ceiling';
  severity: Severity;
  message: string;
}

/** Conservative joint limits (degrees of flexion from straight). */
export const ROM_LIMITS = { elbowFlexDeg: 145, kneeFlexDeg: 150, hipFlexDeg: 130, ankleDorsiflexDeg: 40 } as const;

export function jointAngles(w: WorldPose, side: Side) {
  const p = (n: string) => w[`${n}_${side}`]!.position;
  const trunkUp = sub(w.spine_03!.position, w.pelvis!.position);
  return {
    elbowFlexDeg: angleBetweenDeg(sub(p('lowerarm'), p('upperarm')), sub(p('hand'), p('lowerarm'))),
    kneeFlexDeg: angleBetweenDeg(sub(p('calf'), p('thigh')), sub(p('foot'), p('calf'))),
    hipFlexDeg: 180 - angleBetweenDeg(trunkUp, sub(p('calf'), p('thigh'))),
    ankleDorsiflexDeg: angleBetweenDeg(sub(p('calf'), p('foot')), Y_AXIS),
  };
}

export function headTop(sk: SkeletonDef, w: WorldPose, scaleFactor: number) {
  return add(w.head!.position, rotate(w.head!.rotation, scale(sk.headTopLocal, scaleFactor)));
}

/**
 * Where the posed body actually carries the bar. The solver places the bar at neck_01 (rest) plus the
 * offset, rigid with the torso; spine_03 moves with the torso and ignores the neck/head counter-rotation,
 * so the bar is expressed in spine_03's frame at rest and re-posed from the solved world.
 */
export function carriedBarCenter(sk: SkeletonDef, sol: SmithSquatSolution, barRestOffsetCm: Vec3): Vec3 {
  const s = sol.scaleFactor;
  const rest = restPose(sk, s);
  const barRest = add(rest.neck_01!.position, scale(barRestOffsetCm, s));
  const barLocal = rotate(conjugate(rest.spine_03!.rotation), sub(barRest, rest.spine_03!.position));
  return add(sol.world.spine_03!.position, rotate(sol.world.spine_03!.rotation, barLocal));
}

export function validateSmithSquat(
  sk: SkeletonDef,
  sol: SmithSquatSolution,
  ctx: { smith: SmithParams; barRestOffsetCm: Vec3; ceilingCm?: number; clearanceMarginCm?: number },
): Finding[] {
  const out: Finding[] = [];
  const error = (check: Finding['check'], message: string) => out.push({ check, severity: 'error', message });
  const w = sol.world;
  const s = sol.scaleFactor;

  for (const [bone, target] of Object.entries(sol.targets)) {
    const d = distance(w[bone]!.position, target);
    if (d > 1) error('anchor', `${bone} is ${d.toFixed(1)} cm from its target`);
  }

  const rest = restPose(sk, s);
  for (const side of ['l', 'r'] as const) {
    const dy = Math.abs(w[`ball_${side}`]!.position[1] - rest[`ball_${side}`]!.position[1]);
    if (dy > 1.5) error('feet-flat', `ball_${side} lifted ${dy.toFixed(1)} cm off the floor`);
  }

  const carried = carriedBarCenter(sk, sol, ctx.barRestOffsetCm);
  const offRail = Math.abs(carried[2] - ctx.smith.railZCm);
  const offCentre = Math.abs(carried[0]);
  if (offRail > 0.5 || offCentre > 0.5) {
    error('bar-on-rail', `bar is ${offRail.toFixed(1)} cm off the rail and ${offCentre.toFixed(1)} cm off the centre line`);
  }
  const drift = distance(carried, sol.barCenter);
  if (drift > 0.5) error('bar-on-rail', `bar is not where the body carries it (${drift.toFixed(1)} cm apart)`);
  const y = carried[1];
  if (y < ctx.smith.lowestBarHeightCm || y > ctx.smith.highestBarHeightCm) {
    error('bar-travel', `bar at ${y.toFixed(0)} cm is outside ${ctx.smith.lowestBarHeightCm}–${ctx.smith.highestBarHeightCm} cm`);
  }

  for (const b of sk.bones) {
    if (!b.parent) continue;
    const expected = length(b.restLocalT) * s;
    const actual = distance(w[b.name]!.position, w[b.parent]!.position);
    if (Math.abs(actual - expected) > 0.1) error('bone-length', `${b.name} length changed by ${(actual - expected).toFixed(2)} cm`);
  }

  for (const side of ['l', 'r'] as const) {
    const a = jointAngles(w, side);
    for (const [k, limit] of Object.entries(ROM_LIMITS) as Array<[keyof typeof ROM_LIMITS, number]>) {
      if (a[k] > limit) error('rom', `${k.replace('Deg', '')}_${side} at ${a[k].toFixed(0)}° exceeds ${limit}°`);
    }
  }

  if (ctx.ceilingCm !== undefined) {
    const margin = ctx.clearanceMarginCm ?? 10;
    const top = Math.max(headTop(sk, w, s)[1], y + ctx.smith.plateDiameterCm / 2);
    if (top > ctx.ceilingCm - margin) {
      error('ceiling', `highest point ${top.toFixed(0)} cm leaves less than ${margin} cm below the ${ctx.ceilingCm} cm ceiling`);
    }
  }
  return out;
}
