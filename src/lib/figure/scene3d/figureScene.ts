import skeletonJson from '../pose/skeleton.json';
import type { SkeletonDef } from '../pose/skeleton';
import { solveSmithSquat, type SmithSquatFrame, type SmithSquatSolution, type SmithSquatSpec } from '../pose/smithSquat';
import { buildSmith, ILLUSTRATIVE_SMITH } from '../geometry/smith';
import { barArrow } from '../overlay';
import { buildEquipment, setBarHeight } from './equipment';
import { applyPose, loadHuman } from './human';
import { createStage, disposeStage, type OrbitView, projectCm, renderStage, setOrbitView, type Stage } from './stage';

export const DEFAULT_STATURE_CM = 175;
export const SKELETON = skeletonJson as unknown as SkeletonDef;

export interface FigureScene {
  stage: Stage;
  view: OrbitView;
  showFrame(index: number): SmithSquatSolution;
  /** Solve and show an in-between pose (t in 0..1); constraints hold at every step. */
  showBetween(from: number, to: number, t: number): SmithSquatSolution;
  /** The frame's movement arrow projected to canvas pixels, if it has one. */
  arrow(index: number): { from: [number, number]; to: [number, number] } | null;
  render(): void;
  dispose(): void;
}

export async function mountFigure(
  canvas: HTMLCanvasElement,
  opts: { width: number; height: number; modelUrl: string; spec: SmithSquatSpec; statureCm?: number; pixelRatio?: number },
): Promise<FigureScene> {
  const { spec } = opts;
  const statureCm = opts.statureCm ?? DEFAULT_STATURE_CM;
  const smith = ILLUSTRATIVE_SMITH;
  const solve = (frame: SmithSquatFrame) => solveSmithSquat(SKELETON, spec, frame, { statureCm, railZCm: smith.railZCm });
  const keyframes = spec.frames.map(solve);
  const lowestBar = Math.min(...keyframes.map((f) => f.barCenter[1]));
  const k = statureCm / DEFAULT_STATURE_CM;
  const view: OrbitView = {
    azimuthDeg: spec.camera.azimuthDeg,
    elevationDeg: spec.camera.elevationDeg,
    distanceCm: spec.camera.distanceCm * k,
    targetCm: [0, spec.camera.targetYCm * k, smith.railZCm],
  };

  const stage = createStage(canvas, opts.width, opts.height, opts.pixelRatio);
  let rig: Awaited<ReturnType<typeof loadHuman>>;
  let equipment: ReturnType<typeof buildEquipment>;
  try {
    setOrbitView(stage, view);
    equipment = buildEquipment(buildSmith(smith, { barHeightCm: keyframes[0]!.barCenter[1], catchHeightCm: lowestBar - 8 }));
    stage.scene.add(equipment);
    rig = await loadHuman(opts.modelUrl);
    stage.scene.add(rig.root);
  } catch (e) {
    disposeStage(stage); // do not leak the WebGL context when the model fails to load
    throw e;
  }

  const show = (sol: SmithSquatSolution) => {
    applyPose(rig, { local: sol.local, rootPosition: sol.rootPosition }, sol.scaleFactor);
    setBarHeight(equipment, sol.barCenter[1]);
    return sol;
  };

  return {
    stage,
    view,
    showFrame: (i) => show(keyframes[i]!),
    showBetween: (a, b, t) => {
      const n = spec.frames.length;
      const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < n;
      if (!valid(a) || !valid(b)) throw new RangeError(`showBetween(${a}, ${b}): frame indices must be integers in 0..${n - 1}`);
      const fa = spec.frames[a]!;
      const fb = spec.frames[b]!;
      return show(
        solve({
          ...fa,
          id: `${fa.id}>${fb.id}`,
          shankDeg: fa.shankDeg + (fb.shankDeg - fa.shankDeg) * t,
          thighDeg: fa.thighDeg + (fb.thighDeg - fa.thighDeg) * t,
        }),
      );
    },
    arrow: (i) => {
      const a = barArrow(spec.frames[i]?.arrow, keyframes[i]!.barCenter, smith);
      return a ? { from: projectCm(stage, a.from), to: projectCm(stage, a.to) } : null;
    },
    render: () => renderStage(stage),
    dispose: () => disposeStage(stage),
  };
}
