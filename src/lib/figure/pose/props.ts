import { type Vec3, midpoint, normalize, sub } from '../math/vec3';
import { buildAbWheel, buildBand, buildBarbell, buildCloseGripHandle, buildDumbbell, buildLatBar, buildRope, buildSingleHandle, cableLine } from '../geometry/implements';
import type { Primitive } from '../geometry/primitives';
import { pulleyPoint, smithMovingParts } from '../geometry/trainer';
import type { SceneParams } from '../geometry/scene';
import { gripPoint, handAcross } from './body';
import type { Side } from './hands';
import type { PoseFrame } from './poseSpec';
import { gripKind, type PoseSolution } from './solvePose';

/**
 * The moving equipment of a solved frame (spec §8.2: the same geometry is checked and drawn). Bars and
 * the ab wheel sit where the frame placed them; dumbbells, handles, cables and bands follow the posed
 * hands, so what the hands hold is always in the hands.
 */
export function frameProps(frame: PoseFrame, sol: PoseSolution, params: SceneParams): Primitive[] {
  const p = frame.props ?? {};
  const w = sol.world;
  const grip = (side: Side) => gripPoint(w, side, gripKind(frame.arms[side]), sol.k);
  const out: Primitive[] = [];
  if (sol.smithBar) out.push(...smithMovingParts(params.trainer, sol.smithBar[1]));
  if (p.barbell) out.push(...buildBarbell('barbell', sol.anchors['hold.barbell']!));
  if (p.abWheel) out.push(...buildAbWheel('ab-wheel', sol.anchors['hold.ab-wheel']!));
  for (const side of p.dumbbells ?? []) out.push(...buildDumbbell(`dumbbell-${side}`, grip(side), handAcross(w, side)));
  if (p.band) out.push(...buildBand('band', [grip('l'), grip('r')]));
  if (p.cable) {
    const pulley: Vec3 = pulleyPoint(params.trainer, p.cable.column, p.cable.pulley);
    const hands: [Vec3, Vec3] = [grip('l'), grip('r')];
    let built: { prims: Primitive[]; attach: Vec3 };
    if (p.cable.handle === 'rope') built = buildRope('rope', hands, pulley);
    else if (p.cable.handle === 'lat-bar') built = buildLatBar('lat-bar', hands, pulley);
    else if (p.cable.handle === 'close-grip-row-handle') built = buildCloseGripHandle('close-grip', hands, [handAcross(w, 'l'), handAcross(w, 'r')], pulley);
    else if (p.cable.hand === 'both') {
      built = buildSingleHandle('single-handle', midpoint(hands[0], hands[1]), normalize(sub(hands[0], hands[1])), pulley);
    } else {
      const side = p.cable.hand ?? 'l';
      built = buildSingleHandle('single-handle', grip(side), handAcross(w, side), pulley);
    }
    out.push(...built.prims, cableLine('cable', pulley, built.attach));
  }
  return out;
}

/** Props that are solid implements: they must not pass through the floor or the equipment. */
export const SOLID_PROP = /^(dumbbell-|barbell-(plate|collar|sleeve)|ab-wheel-(wheel|hub))/;

/** The Smith bar's moving parts (bar, plates, carriages). */
export const SMITH_BAR_PART = /^(bar$|plate-|carriage-)/;
