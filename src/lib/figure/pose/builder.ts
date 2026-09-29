import { type Vec3, add, dot, length, normalize, scale, sub } from '../math/vec3';
import { type Quat, conjugate, fromAxisAngle, fromUnitVectors, IDENTITY, multiply, normalizeQuat, rotate } from '../math/quat';
import { type BoneDef, type SkeletonDef, type WorldPose, boneMap, forwardKinematics } from './skeleton';

/** Mutable pose under construction. Every operation is a rotation, so bone lengths never change. */
export class PoseBuilder {
  readonly local: Record<string, Quat>;
  rootPosition: Vec3;
  private readonly defs: Map<string, BoneDef>;

  constructor(
    readonly sk: SkeletonDef,
    readonly scaleFactor: number,
  ) {
    this.defs = boneMap(sk);
    this.local = Object.fromEntries(sk.bones.map((b) => [b.name, b.restLocalR]));
    this.rootPosition = scale(sk.bones[0]!.restLocalT, scaleFactor);
  }

  def(name: string): BoneDef {
    const d = this.defs.get(name);
    if (!d) throw new Error(`Unknown bone "${name}"`);
    return d;
  }

  world(): WorldPose {
    return forwardKinematics(this.sk, { local: this.local, rootPosition: this.rootPosition }, this.scaleFactor);
  }

  /** Set a bone's world rotation; its children follow rigidly. */
  setWorldRotation(bone: string, worldRot: Quat): void {
    const d = this.def(bone);
    const parentRot = d.parent ? this.world()[d.parent]!.rotation : IDENTITY;
    this.local[bone] = normalizeQuat(multiply(conjugate(parentRot), worldRot));
  }

  /** Rotate a bone about a world-space axis through its head. */
  rotateWorld(bone: string, axis: Vec3, angleRad: number): void {
    this.setWorldRotation(bone, multiply(fromAxisAngle(axis, angleRad), this.world()[bone]!.rotation));
  }

  /** Rotate a bone about an axis expressed in its own local frame. */
  rotateLocal(bone: string, axisLocal: Vec3, angleRad: number): void {
    this.local[bone] = normalizeQuat(multiply(this.local[bone]!, fromAxisAngle(axisLocal, angleRad)));
  }

  /**
   * Point `bone` so its child `child` lies on the line toward `target`. Starts from the bone's rest
   * orientation relative to its posed parent and applies the shortest swing, which keeps twist natural.
   */
  aim(bone: string, child: string, target: Vec3): void {
    const d = this.def(bone);
    const c = this.def(child);
    if (c.parent !== bone) throw new Error(`aim: "${child}" is not a child of "${bone}"`);
    const w = this.world();
    const parentRot = d.parent ? w[d.parent]!.rotation : IDENTITY;
    const restWorldRot = multiply(parentRot, d.restLocalR);
    const swing = fromUnitVectors(rotate(restWorldRot, c.restLocalT), sub(target, w[bone]!.position));
    this.setWorldRotation(bone, multiply(swing, restWorldRot));
  }

  /**
   * Analytic two-bone IK: upper -> lower -> end, bending the middle joint toward `pole`.
   * Returns where the end joint landed (differs from `target` only when out of reach).
   */
  twoBoneIK(upper: string, lower: string, end: string, target: Vec3, pole: Vec3): Vec3 {
    const a = this.world()[upper]!.position;
    const l1 = length(this.def(lower).restLocalT) * this.scaleFactor;
    const l2 = length(this.def(end).restLocalT) * this.scaleFactor;
    const toTarget = sub(target, a);
    const d = Math.min(Math.max(length(toTarget), Math.abs(l1 - l2) + 1e-6), l1 + l2 - 1e-6);
    const dir = normalize(toTarget);
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    const poleOrtho = normalize(sub(pole, scale(dir, dot(pole, dir))));
    const mid = add(add(a, scale(dir, along)), scale(poleOrtho, h));
    const reached = add(a, scale(dir, d));
    this.aim(upper, lower, mid);
    this.aim(lower, end, reached);
    return reached;
  }
}
