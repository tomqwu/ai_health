import { type Vec3, add, cross, normalize, scale, sub, Y_AXIS } from '../math/vec3';
import { type Quat, multiply, rotate } from '../math/quat';

/**
 * Pose-layer conventions:
 * - units: centimetres
 * - axes (glTF): +Y up, +Z = the figure's forward (facing) direction, +X = the figure's LEFT
 * - bones are listed parents-first; the first bone is the root (parent null)
 */
export interface BoneDef {
  name: string;
  parent: string | null;
  /** Head position in the parent's local frame (cm, at the model's native stature). */
  restLocalT: Vec3;
  /** Rest rotation relative to the parent. */
  restLocalR: Quat;
}

export interface SkeletonDef {
  source: { file: string; sha256: string };
  /** Body mesh height at rest (cm). Pose scale factor = targetStature / statureCm. */
  statureCm: number;
  bones: readonly BoneDef[];
  /** Top of the skull in the `head` bone's local frame (cm, native). */
  headTopLocal: Vec3;
}

export interface BoneState {
  position: Vec3;
  rotation: Quat;
}

export type LocalRotations = Readonly<Record<string, Quat>>;
export type WorldPose = Readonly<Record<string, BoneState>>;

export interface PoseInput {
  /** Full local rotation per bone; bones not listed keep their rest rotation. */
  local: LocalRotations;
  /** World position of the root bone (cm, already scaled). Defaults to its scaled rest position. */
  rootPosition?: Vec3;
}

export function boneMap(sk: SkeletonDef): Map<string, BoneDef> {
  return new Map(sk.bones.map((b) => [b.name, b]));
}

export function forwardKinematics(sk: SkeletonDef, input: PoseInput, scaleFactor: number): WorldPose {
  const out: Record<string, BoneState> = {};
  for (const b of sk.bones) {
    const localR = input.local[b.name] ?? b.restLocalR;
    if (b.parent === null) {
      out[b.name] = { position: input.rootPosition ?? scale(b.restLocalT, scaleFactor), rotation: localR };
      continue;
    }
    const p = out[b.parent];
    if (!p) throw new Error(`forwardKinematics: bone "${b.name}" is listed before its parent "${b.parent}"`);
    out[b.name] = {
      position: add(p.position, rotate(p.rotation, scale(b.restLocalT, scaleFactor))),
      rotation: multiply(p.rotation, localR),
    };
  }
  return out;
}

export function restPose(sk: SkeletonDef, scaleFactor: number): WorldPose {
  return forwardKinematics(sk, { local: {} }, scaleFactor);
}

/**
 * The body's facing direction in a pose, from its hip line (left hip minus right hip) crossed with up.
 * Taken from the rest pose it is the rig's own forward, whatever its bones' axis conventions.
 */
export function bodyForward(w: WorldPose): Vec3 {
  return normalize(cross(sub(w.thigh_l!.position, w.thigh_r!.position), Y_AXIS));
}
