import { type Vec3, add, cross, dot, length, normalize, scale, sub, X_AXIS, Y_AXIS, Z_AXIS } from '../math/vec3';
import { type Quat, conjugate, fromAxisAngle, fromUnitVectors, IDENTITY, multiply, normalizeQuat, rotate } from '../math/quat';
import { type BoneDef, type SkeletonDef, type WorldPose, boneMap, forwardKinematics } from './skeleton';

/**
 * Roll (twist) control for {@link PoseBuilder.aim}. Aiming fixes where a bone points but not how it
 * is turned about its own length; a roll hint fixes that too. Both vectors are world-space directions;
 * only their parts perpendicular to the bone count.
 */
export interface AimRoll {
  /** The direction the chosen side of the bone faces after aiming. */
  up: Vec3;
  /**
   * The direction that side faced in the bone's rest orientation (relative to its posed parent),
   * which picks the side. Defaults to `up`: "the side that faced `up` at rest still faces `up`".
   */
  restUp?: Vec3;
}

/** Below this, 1 + cos(angle) counts as "exactly opposite" (within about 0.08°). */
const OPPOSITE_EPS = 1e-6;
/** A roll hint or pole whose perpendicular part is shorter than this fraction of its length is parallel. */
const PARALLEL_EPS = 1e-6;
/** Distances below this (cm) count as zero. */
const ZERO_CM = 1e-9;

const isFiniteVec = (v: Vec3): boolean => v.length === 3 && v.every(Number.isFinite);

/** The part of `v` perpendicular to unit `axis`, normalised; null when `v` is (nearly) parallel to it. */
function perpendicularUnit(v: Vec3, axis: Vec3): Vec3 | null {
  const p = sub(v, scale(axis, dot(v, axis)));
  const l = length(p);
  return l > PARALLEL_EPS * length(v) && l > 0 ? scale(p, 1 / l) : null;
}

/**
 * Swing taking unit `from` onto unit `to`. The shortest arc, except when the two are (nearly)
 * opposite: every axis perpendicular to `from` is then equally short, so the choice is made
 * deterministically from world geometry: a half turn about the axis perpendicular to `from` closest
 * to the figure's left-right axis (+X; +Z if `from` lies along X), i.e. through the sagittal plane
 * like a forward arm raise, then a small correction onto `to`.
 */
function swingBetween(from: Vec3, to: Vec3): Quat {
  if (1 + dot(from, to) >= OPPOSITE_EPS) return fromUnitVectors(from, to);
  const axis = perpendicularUnit(X_AXIS, from) ?? perpendicularUnit(Z_AXIS, from)!;
  const flip = fromAxisAngle(axis, Math.PI);
  return normalizeQuat(multiply(fromUnitVectors(rotate(flip, from), to), flip));
}

/** Mutable pose under construction. Every operation is a rotation, so bone lengths never change. */
export class PoseBuilder {
  readonly local: Record<string, Quat>;
  rootPosition: Vec3;
  private readonly defs: Map<string, BoneDef>;
  private restWorldCache?: WorldPose;

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
   * Point `bone` so its child `child` lies on the line toward `target` (a world point).
   *
   * Without `roll`, starts from the bone's rest orientation relative to its posed parent and applies
   * the shortest swing, which keeps twist natural for moderate swings. The shortest swing is
   * undefined when the target lies opposite the rest direction (an arm going overhead from hanging);
   * that case is resolved deterministically (see `swingBetween`), but the twist can still jump as the
   * target crosses the opposite direction. Pass `roll` whenever a bone may swing that far: the bone is
   * then turned about its own length so the side picked by `roll.restUp` faces `roll.up`, which fixes
   * the twist continuously for every target.
   *
   * Throws (without changing the pose) when the target is at the bone's head or a roll vector is
   * zero or parallel to the aim.
   */
  aim(bone: string, child: string, target: Vec3, roll?: AimRoll): void {
    const d = this.def(bone);
    const w = this.world();
    const parentRot = d.parent ? w[d.parent]!.rotation : IDENTITY;
    this.local[bone] = normalizeQuat(
      multiply(conjugate(parentRot), this.aimRotation(bone, child, parentRot, w[bone]!.position, target, roll)),
    );
  }

  /**
   * The world rotation `aim` would give `bone`, for a parent world rotation and head position.
   * Pure: validates everything and changes nothing, so callers can compute before they commit.
   */
  private aimRotation(bone: string, child: string, parentRot: Quat, head: Vec3, target: Vec3, roll?: AimRoll): Quat {
    const d = this.def(bone);
    const c = this.def(child);
    const what = `aim(${bone} → ${child})`;
    if (c.parent !== bone) throw new Error(`${what}: "${child}" is not a child of "${bone}"`);
    if (!isFiniteVec(target)) throw new Error(`${what}: target is not a finite point (${String(target)})`);
    if (length(c.restLocalT) === 0) throw new Error(`${what}: the bone has zero length, so it has no direction`);
    const toTarget = sub(target, head);
    if (length(toTarget) <= ZERO_CM) throw new Error(`${what}: target is at the bone's head, so there is no direction to aim at`);
    const restWorldRot = multiply(parentRot, d.restLocalR);
    const from = normalize(rotate(restWorldRot, c.restLocalT));
    const to = normalize(toTarget);
    let swing = swingBetween(from, to);
    if (roll) {
      const restUp = roll.restUp ?? roll.up;
      for (const [name, v] of [
        ['roll.up', roll.up],
        ['roll.restUp', restUp],
      ] as const) {
        if (!isFiniteVec(v) || length(v) === 0) throw new Error(`${what}: ${name} must be a finite, non-zero direction`);
      }
      const sideRest = perpendicularUnit(restUp, from);
      if (!sideRest) throw new Error(`${what}: roll.restUp is parallel to the bone's rest direction, so it picks no side`);
      const sideWant = perpendicularUnit(roll.up, to);
      if (!sideWant) throw new Error(`${what}: roll.up is parallel to the aim direction, so it cannot set the roll`);
      const side = rotate(swing, sideRest);
      const twist = Math.atan2(dot(cross(side, sideWant), to), dot(side, sideWant));
      swing = multiply(fromAxisAngle(to, twist), swing);
    }
    return normalizeQuat(multiply(swing, restWorldRot));
  }

  /**
   * Analytic two-bone IK over the chain upper → lower → end (each the parent of the next), bending the
   * middle joint toward `pole`. Returns where the end joint landed (differs from `target` only when
   * out of reach).
   *
   * `target` is a world point. `pole` is a world **direction**, not a point: the middle joint moves off
   * the root→target axis toward the side `pole` points to (only its part perpendicular to that axis
   * counts; its length does not matter). When `pole` is parallel to the axis it carries no side, so the
   * joint bends toward the body's forward instead (+Z in the rest pose, turned with the upper bone's
   * parent), or toward the body's up (+Y, turned likewise) when the axis itself runs forward.
   *
   * `opts.upperRoll` / `opts.lowerRoll` fix each bone's twist as in {@link aim}; joint positions do not
   * depend on them. `opts.bendSide` is the anatomical shortcut for the upper bone: the side of `upper`
   * that faces the bend, as a direction in the rest pose (forward for an elbow, backward for a knee).
   * The upper bone is then rolled so that side faces the lower bone, which makes the middle joint bend
   * like a hinge about its own axis instead of wherever the shortest swing left the upper bone's twist.
   *
   * Every input is validated and both rotations are computed before any bone changes, so a call that
   * throws leaves the builder as it was.
   */
  twoBoneIK(
    upper: string,
    lower: string,
    end: string,
    target: Vec3,
    pole: Vec3,
    opts: { upperRoll?: AimRoll; lowerRoll?: AimRoll; bendSide?: Vec3 } = {},
  ): Vec3 {
    const chain = `twoBoneIK(${upper} → ${lower} → ${end})`;
    const du = this.def(upper);
    const dl = this.def(lower);
    const de = this.def(end);
    if (dl.parent !== upper || de.parent !== lower) {
      throw new Error(`${chain}: not a chain; each bone must be the parent of the next (${lower}'s parent is ${dl.parent}, ${end}'s is ${de.parent})`);
    }
    if (!isFiniteVec(target)) throw new Error(`${chain}: target is not a finite point (${String(target)})`);
    if (!isFiniteVec(pole) || length(pole) === 0) {
      throw new Error(`${chain}: pole must be a finite, non-zero direction (got ${String(pole)})`);
    }
    if (opts.bendSide !== undefined) {
      if (opts.upperRoll) throw new Error(`${chain}: pass bendSide or upperRoll, not both`);
      if (!isFiniteVec(opts.bendSide) || length(opts.bendSide) === 0) {
        throw new Error(`${chain}: bendSide must be a finite, non-zero direction (got ${String(opts.bendSide)})`);
      }
    }
    const w = this.world();
    const a = w[upper]!.position;
    const l1 = length(dl.restLocalT) * this.scaleFactor;
    const l2 = length(de.restLocalT) * this.scaleFactor;
    if (!(l1 > ZERO_CM && l2 > ZERO_CM)) throw new Error(`${chain}: a bone in the chain has zero length`);
    const toTarget = sub(target, a);
    if (length(toTarget) <= ZERO_CM) throw new Error(`${chain}: target is at the ${upper} joint, so there is no direction to reach in`);

    const d = Math.min(Math.max(length(toTarget), Math.abs(l1 - l2) + 1e-6), l1 + l2 - 1e-6);
    const dir = normalize(toTarget);
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    const parentRot = du.parent ? w[du.parent]!.rotation : IDENTITY;
    const bodyTurn = du.parent ? multiply(parentRot, conjugate(this.restWorld()[du.parent]!.rotation)) : IDENTITY;
    const bend =
      perpendicularUnit(pole, dir) ?? perpendicularUnit(rotate(bodyTurn, Z_AXIS), dir) ?? perpendicularUnit(rotate(bodyTurn, Y_AXIS), dir)!;
    const mid = add(add(a, scale(dir, along)), scale(bend, h));
    const reached = add(a, scale(dir, d));

    // Solve both bones before touching either, so a throw cannot leave a half-applied pose.
    const upperRoll = opts.bendSide ? { restUp: rotate(bodyTurn, opts.bendSide), up: sub(reached, mid) } : opts.upperRoll;
    const upperWorld = this.aimRotation(upper, lower, parentRot, a, mid, upperRoll);
    const lowerHead = add(a, rotate(upperWorld, scale(dl.restLocalT, this.scaleFactor)));
    this.aimRotation(lower, end, upperWorld, lowerHead, reached, opts.lowerRoll);

    // Commit. The lower bone is solved again from the committed upper bone as forward kinematics sees
    // it (rig rotations are unit only to ~1e-8), so the result matches aiming the two bones in turn.
    const before = this.local[upper]!;
    this.local[upper] = normalizeQuat(multiply(conjugate(parentRot), upperWorld));
    try {
      const w2 = this.world();
      const upperRot = w2[upper]!.rotation;
      const lowerWorld = this.aimRotation(lower, end, upperRot, w2[lower]!.position, reached, opts.lowerRoll);
      this.local[lower] = normalizeQuat(multiply(conjugate(upperRot), lowerWorld));
    } catch (e) {
      this.local[upper] = before;
      throw e;
    }
    return reached;
  }

  /** World rotations of the rest pose (independent of scale), computed once. */
  private restWorld(): WorldPose {
    return (this.restWorldCache ??= forwardKinematics(this.sk, { local: {} }, 1));
  }
}
