import { type Vec3, add, distance, midpoint, normalize, scale, sub } from './math/vec3';
import type { Quat } from './math/quat';
import type { I18nText } from '../i18n/locales';
import type { Built } from './geometry/built';
import type { Primitive } from './geometry/primitives';
import { buildScene, ILLUSTRATIVE_SCENE, type SceneParams } from './geometry/scene';
import { buildSmith, catchHeightFor } from './geometry/smith';
import { smithMovingParts, smithPart } from './geometry/trainer';
import { barArrow } from './overlay';
import { checkFigureFrame } from './pose/checkFigureFrame';
import { bodyCapsules, capsuleGap, gripPoint } from './pose/body';
import { interpolatePoseFrame } from './pose/interpolate';
import { PLAY_ORDER } from './pose/playOrder';
import { type ExpectedFailure, type PoseFigureSpec, type PoseFrame, REFERENCE_STATURE_CM, type TrackPoint } from './pose/poseSpec';
import { frameProps } from './pose/props';
import type { SkeletonDef, WorldPose } from './pose/skeleton';
import { interpolateFrame, type SmithSquatSpec } from './pose/smithSquat';
import { gripKind, type PoseSolution, resolvePoint, solvePose } from './pose/solvePose';
import { carriedBarCenter, type Finding, headTop } from './pose/validate';
import { poseTop, validatePose } from './pose/validatePose';

/** What changes a figure's pose besides the frame: stature, equipment dimensions and (profile only) the room. */
export interface FigureContext {
  statureCm: number;
  /** Equipment dimensions; default illustrative (D12). */
  params?: SceneParams;
  ceilingCm?: number;
  clearanceMarginCm?: number;
}

/** A keyframe, or an in-between pose `t` of the way from keyframe `from` to `to` (the viewer's Play). */
export type FrameRef = number | { from: number; to: number; t: number };

/**
 * `validate: false` only poses (for drawing, e.g. every animation frame of Play): no findings, no
 * envelope (`topCm` is NaN) and no arrow. Default true.
 */
export interface PoseOptions {
  validate?: boolean;
}

/** One solved and validated pose, ready to draw. */
export interface PosedFigure {
  frameId: string;
  scaleFactor: number;
  local: Readonly<Record<string, Quat>>;
  rootPosition: Vec3;
  world: WorldPose;
  /** Moving equipment in this pose. */
  props: Primitive[];
  /** Movement arrow (world cm); keyframes only. */
  arrow: { from: Vec3; to: Vec3 } | null;
  findings: Finding[];
  /** Highest point of the body and implements (cm), for the ceiling check; NaN when not validated. */
  topCm: number;
  /** Smith bar centre height (cm, floor to bar centre), when the frame moves the Smith bar. */
  smithBarCm?: number;
  /** How many times the solver ran for this pose (settling an in-between pose, the pose, the arrow's target). */
  solves: number;
}

export interface OrbitSpec {
  azimuthDeg: number;
  elevationDeg: number;
  distanceCm: number;
  targetCm: Vec3;
}

/**
 * A figure as every consumer sees it (renderer, viewer, engine probe, sweep): three labelled frames that
 * can be posed at any stature and equipment dimensions, a fixed scene and a camera.
 */
export interface FigureModel {
  id: string;
  name: I18nText;
  frames: ReadonlyArray<{ id: string; label: I18nText; cue: I18nText }>;
  playOrder: readonly number[];
  unilateral: boolean;
  expectedFailures: readonly ExpectedFailure[];
  /** The fixed equipment at this stature and these dimensions. */
  scene(sk: SkeletonDef, ctx: FigureContext): Built;
  camera(ctx: FigureContext): OrbitSpec;
  pose(sk: SkeletonDef, frame: FrameRef, ctx: FigureContext, opts?: PoseOptions): PosedFigure;
}

const ARROW_CM = 36;
/** Settling in-between poses: stop within this gap (cm), after at most this many secant steps. */
export const SETTLE_TOLERANCE_CM = 0.05;
export const SETTLE_STEPS = 5;

// ── Generalized pose figures ────────────────────────────────────────────────────

/** Where a tracked point is in a solved frame. */
function track(p: TrackPoint, frame: PoseFrame, sol: PoseSolution): Vec3 {
  const w = sol.world;
  const grip = (side: 'l' | 'r') => gripPoint(w, side, gripKind(frame.arms[side]), sol.k);
  switch (p) {
    case 'hands':
      return midpoint(grip('l'), grip('r'));
    case 'hand_l':
      return grip('l');
    case 'hand_r':
      return grip('r');
    case 'bar': {
      const bar = sol.smithBar ?? sol.anchors['hold.barbell'] ?? sol.anchors['hold.ab-wheel'];
      if (!bar) throw new Error(`frame "${frame.id}": an arrow tracks the bar, but the frame holds none`);
      return bar;
    }
    case 'hips':
      return sol.anchors['body.hips']!;
    case 'chest':
      return sol.anchors['body.chest']!;
    case 'head':
      return w.head!.position;
    case 'knees':
      return midpoint(w.calf_l!.position, w.calf_r!.position);
    case 'feet':
      return midpoint(w.foot_l!.position, w.foot_r!.position);
  }
}

/** Wrap a generalized pose spec (`kind: 'pose'`) as a figure. */
export function poseFigure(spec: PoseFigureSpec): FigureModel {
  const paramsOf = (ctx: FigureContext) => ctx.params ?? ILLUSTRATIVE_SCENE;
  const railZ = (ctx: FigureContext) => (spec.scene.trainer ? paramsOf(ctx).trainer.railZCm : undefined);
  const solveOne = (sk: SkeletonDef, frame: PoseFrame, ctx: FigureContext, built: Built, settleCm = 0) => {
    const sol = solvePose(sk, frame, { statureCm: ctx.statureCm, scene: built, railZCm: railZ(ctx), settleCm });
    return { sol, props: frameProps(frame, sol, paramsOf(ctx)) };
  };
  // The equipment as placed, without stature-dependent settings: build it once per set of dimensions.
  let placed: { params: SceneParams; built: Built } | undefined;
  const base = (ctx: FigureContext): Built => {
    const params = paramsOf(ctx);
    if (placed?.params !== params) placed = { params, built: buildScene(spec.scene, params) };
    return placed.built;
  };
  /**
   * The fixed scene. Catches that follow the bar (`trainer.catchBelowLowestBarCm`) are set below the
   * lowest Smith bar of the keyframes, solved against the placed equipment (the catches move no anchor
   * a pose uses), so that scene is built once per stature and set of dimensions.
   */
  const catchBelow = spec.scene.trainer?.catchBelowLowestBarCm;
  let set: { params: SceneParams; sk: SkeletonDef; statureCm: number; built: Built } | undefined;
  const scene = (sk: SkeletonDef, ctx: FigureContext): Built => {
    if (catchBelow === undefined) return base(ctx);
    const params = paramsOf(ctx);
    if (set?.params === params && set.sk === sk && set.statureCm === ctx.statureCm) return set.built;
    const bars = spec.frames.map((f) => solveOne(sk, f, ctx, base(ctx)).sol.smithBar?.[1]).filter((y) => y !== undefined);
    if (!bars.length) throw new Error(`${spec.id}: trainer.catchBelowLowestBarCm needs a frame that moves the Smith bar`);
    const catchHeightCm = catchHeightFor(params.trainer, Math.min(...bars), catchBelow);
    set = { params, sk, statureCm: ctx.statureCm, built: buildScene({ ...spec.scene, trainer: { ...spec.scene.trainer, catchHeightCm } }, params) };
    return set.built;
  };
  /**
   * Blending two keyframes moves the hips along a straight line, but a body resting on a contact (knees
   * on a pad, shoulders on the floor) moves along an arc: settle the in-between pose vertically until its
   * first declared, measured contact touches again. The gap changes almost one for one with the hips'
   * height, so a secant search from "move down by the gap" settles within 0.05 cm in a few solves.
   * A part lying along a surface (a forearm on the floor) is settled on the mean of its two end gaps:
   * the validator's larger end gap is V-shaped and never reaches 0 while the part tilts, while the mean
   * is smooth, so the search converges and both ends stay within the tolerance of the surface.
   * Returns the settle offset and how many solves it took.
   */
  const settle = (sk: SkeletonDef, frame: PoseFrame, ctx: FigureContext, built: Built): { cm: number; solves: number } => {
    const contact = frame.contacts?.find((c) => !c.loose);
    if (!contact) return { cm: 0, solves: 0 };
    const surface = built.surfaces[contact.on]!;
    let solves = 0;
    const gap = (d: number) => {
      solves++;
      const { sol } = solveOne(sk, frame, ctx, built, d);
      const cap = bodyCapsules(sk, sol.world, sol.scaleFactor, sol.k).find((c) => c.part === contact.part)!;
      return contact.along ? (capsuleGap({ ...cap, b: cap.a }, surface) + capsuleGap({ ...cap, a: cap.b }, surface)) / 2 : capsuleGap(cap, surface);
    };
    let [d0, g0] = [0, gap(0)];
    if (Math.abs(g0) < SETTLE_TOLERANCE_CM) return { cm: 0, solves };
    let [d1, g1] = [-g0, gap(-g0)];
    for (let i = 0; i < SETTLE_STEPS && Math.abs(g1) >= SETTLE_TOLERANCE_CM && g1 !== g0; i++) {
      const d2 = Math.max(-40, Math.min(40, d1 - (g1 * (d1 - d0)) / (g1 - g0)));
      [d0, g0] = [d1, g1];
      [d1, g1] = [d2, gap(d2)];
    }
    return { cm: d1, solves };
  };
  return {
    id: spec.id,
    name: spec.name,
    frames: spec.frames.map((f) => ({ id: f.id, label: f.label, cue: f.cue })),
    playOrder: spec.playOrder ?? PLAY_ORDER,
    unilateral: spec.unilateral ?? false,
    expectedFailures: spec.expectedFailures ?? [],
    scene,
    camera: (ctx) => {
      const k = ctx.statureCm / REFERENCE_STATURE_CM;
      return {
        azimuthDeg: spec.camera.azimuthDeg,
        elevationDeg: spec.camera.elevationDeg,
        distanceCm: spec.camera.distanceCm * k,
        targetCm: resolvePoint(spec.camera.target, base(ctx).anchors, k),
      };
    },
    pose: (sk, ref, ctx, opts = {}) => {
      const built = scene(sk, ctx);
      const frame = typeof ref === 'number' ? spec.frames[ref] : interpolatePoseFrame(spec.frames[ref.from]!, spec.frames[ref.to]!, ref.t);
      if (!frame) throw new RangeError(`${spec.id}: no frame ${String(ref)}`);
      const settled = typeof ref === 'number' ? { cm: 0, solves: 0 } : settle(sk, frame, ctx, built);
      const { sol, props } = solveOne(sk, frame, ctx, built, settled.cm);
      let solves = settled.solves + 1;
      const base = { frameId: frame.id, scaleFactor: sol.scaleFactor, local: sol.local, rootPosition: sol.rootPosition, world: sol.world, props, ...(sol.smithBar && { smithBarCm: sol.smithBar[1] }) };
      if (opts.validate === false) return { ...base, arrow: null, findings: [], topCm: Number.NaN, solves };
      const findings = validatePose(sk, frame, sol, props, { scene: built, params: paramsOf(ctx), ceilingCm: ctx.ceilingCm, clearanceMarginCm: ctx.clearanceMarginCm });
      let arrow: PosedFigure['arrow'] = null;
      if (frame.arrow) {
        const next = spec.frames[frame.arrow.toward]!;
        const there = solveOne(sk, next, ctx, built);
        solves++;
        const from = track(frame.arrow.track, frame, sol);
        const to = track(frame.arrow.track, next, there.sol);
        if (distance(from, to) > 2) {
          const start = add(from, scale(frame.arrow.offsetCm ?? [0, 0, 0], sol.k));
          arrow = { from: start, to: add(start, scale(normalize(sub(to, from)), ARROW_CM * sol.k)) };
        }
      }
      return { ...base, arrow, findings, topCm: poseTop(sk, sol, props), solves };
    },
  };
}

// ── The M1 Smith squat, on its own solver ──────────────────────────────────────

/**
 * Wrap the M1 Smith-squat spec as a figure. Its solver, validator and look are unchanged (the owner
 * signed off on them in M1): the rail comes from the machine, the elbows are checked by bend magnitude
 * only (issue #47, option a), and the arrow runs beside the bar.
 */
export function smithSquatFigure(spec: SmithSquatSpec): FigureModel {
  const smithOf = (ctx: FigureContext) => smithPart((ctx.params ?? ILLUSTRATIVE_SCENE).trainer);
  return {
    id: spec.id,
    name: spec.name,
    frames: spec.frames.map((f) => ({ id: f.id, label: f.label, cue: f.cue })),
    playOrder: PLAY_ORDER,
    unilateral: false,
    expectedFailures: [],
    // The catches sit just below the lowest bar of the set (M1 behaviour), which depends on stature.
    scene: (sk, ctx) => {
      const smith = smithOf(ctx);
      const lowest = Math.min(...spec.frames.map((f) => checkFigureFrame(sk, spec, f, { statureCm: ctx.statureCm, smith }).solution.barCenter[1]));
      return { prims: buildSmith(smith, { barHeightCm: smith.lowestBarHeightCm, catchHeightCm: catchHeightFor(smith, lowest) }).filter((p) => !/^(bar$|plate-|carriage-)/.test(p.id)), anchors: { floor: [0, 0, 0] }, surfaces: {} };
    },
    camera: (ctx) => {
      const k = ctx.statureCm / REFERENCE_STATURE_CM;
      return { azimuthDeg: spec.camera.azimuthDeg, elevationDeg: spec.camera.elevationDeg, distanceCm: spec.camera.distanceCm * k, targetCm: [0, spec.camera.targetYCm * k, smithOf(ctx).railZCm] };
    },
    pose: (sk, ref, ctx) => {
      const smith = smithOf(ctx);
      const frame = typeof ref === 'number' ? spec.frames[ref] : interpolateFrame(spec.frames[ref.from]!, spec.frames[ref.to]!, ref.t);
      if (!frame) throw new RangeError(`${spec.id}: no frame ${String(ref)}`);
      const { solution, findings } = checkFigureFrame(sk, spec, frame, { statureCm: ctx.statureCm, smith, ceilingCm: ctx.ceilingCm, clearanceMarginCm: ctx.clearanceMarginCm });
      const barY = carriedBarCenter(sk, solution, spec.barRestOffsetCm)[1];
      const arrow = typeof ref === 'number' ? barArrow(frame.arrow, solution.barCenter, smith) : null;
      return {
        frameId: frame.id,
        scaleFactor: solution.scaleFactor,
        local: solution.local,
        rootPosition: solution.rootPosition,
        world: solution.world,
        props: smithMovingParts(smith, solution.barCenter[1]),
        arrow,
        findings,
        topCm: Math.max(headTop(sk, solution.world, solution.scaleFactor)[1], barY + smith.plateDiameterCm / 2),
        smithBarCm: barY,
        solves: 1,
      };
    },
  };
}

/** What pages and the viewer island need before the 3D code loads: plain, serializable data. */
export interface FigureMeta {
  id: string;
  name: I18nText;
  frames: ReadonlyArray<{ label: I18nText; cue: I18nText }>;
  unilateral: boolean;
}

export const figureMeta = (f: FigureModel): FigureMeta => ({ id: f.id, name: f.name, frames: f.frames.map(({ label, cue }) => ({ label, cue })), unilateral: f.unilateral });
