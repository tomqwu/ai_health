import { type Vec3, cross, normalize, sub } from '../math/vec3';
import { degToRad } from '../math/quat';
import type { PoseBuilder } from './builder';
import type { WorldPose } from './skeleton';

export type Side = 'l' | 'r';
const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;

/** Unit normal pointing out of the palm, from the knuckle layout (anatomy, not rig axes). */
export function palmNormal(w: WorldPose, side: Side): Vec3 {
  const across = sub(w[`pinky_01_${side}`]!.position, w[`index_01_${side}`]!.position);
  const along = sub(w[`middle_01_${side}`]!.position, w[`hand_${side}`]!.position);
  return normalize(side === 'l' ? cross(across, along) : cross(along, across));
}

/** Curl every finger segment toward the palm (degrees for segments 01/02/03). */
export function curlFingers(
  b: PoseBuilder,
  side: Side,
  fingerDeg: readonly [number, number, number],
  thumbDeg: readonly [number, number, number],
): void {
  for (const finger of [...FINGERS, 'thumb'] as const) {
    const angles = finger === 'thumb' ? thumbDeg : fingerDeg;
    for (let seg = 1; seg <= 3; seg++) {
      const w = b.world();
      const bone = `${finger}_0${seg}_${side}`;
      const dir =
        seg < 3
          ? sub(w[`${finger}_0${seg + 1}_${side}`]!.position, w[bone]!.position)
          : sub(w[bone]!.position, w[`${finger}_0${seg - 1}_${side}`]!.position);
      b.rotateWorld(bone, normalize(cross(dir, palmNormal(w, side))), degToRad(angles[seg - 1]!));
    }
  }
}
