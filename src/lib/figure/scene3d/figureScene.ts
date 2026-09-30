import type { FigureContext, FigureModel, PosedFigure } from '../figures';
import type { EquipmentModel } from '../geometry/models';
import { REAL_SKELETON } from '../pose/realSkeleton';
import { createEquipment } from './equipment';
import { applyPose, loadHuman } from './human';
import { createStage, disposeStage, type OrbitView, projectCm, renderStage, resizeStage, setOrbitView, type Stage } from './stage';

export const DEFAULT_STATURE_CM = 175;

export interface FigureScene {
  stage: Stage;
  view: OrbitView;
  showFrame(index: number): PosedFigure;
  /** Solve and show an in-between pose (t in 0..1); constraints hold at every step. */
  showBetween(from: number, to: number, t: number): PosedFigure;
  /** The frame's movement arrow projected to canvas pixels, if it has one. */
  arrow(index: number): { from: [number, number]; to: [number, number] } | null;
  render(): void;
  /** Resize the canvas drawing buffer, camera and arrow projection to `width` x `height` CSS pixels. Call `render()` afterwards. */
  resize(width: number, height: number, pixelRatio?: number): void;
  dispose(): void;
}

export interface MountOptions {
  width: number;
  height: number;
  modelUrl: string;
  figure: FigureModel;
  statureCm?: number;
  pixelRatio?: number;
}

/** Mount a figure: fixed equipment, the human, and the moving props of whichever pose is shown. */
export async function mountFigure(canvas: HTMLCanvasElement, opts: MountOptions): Promise<FigureScene> {
  const { figure } = opts;
  const ctx: FigureContext = { statureCm: opts.statureCm ?? DEFAULT_STATURE_CM };
  const sk = REAL_SKELETON;
  const keyframes = figure.frames.map((_, i) => figure.pose(sk, i, ctx));
  const view: OrbitView = figure.camera(ctx);

  const stage = createStage(canvas, opts.width, opts.height, opts.pixelRatio);
  const fixed = createEquipment('equipment');
  const moving = createEquipment('props');
  let rig: Awaited<ReturnType<typeof loadHuman>>;
  try {
    setOrbitView(stage, view);
    fixed.update(figure.scene(sk, ctx).prims);
    stage.scene.add(fixed.group, moving.group);
    rig = await loadHuman(opts.modelUrl);
    stage.scene.add(rig.root);
  } catch (e) {
    disposeStage(stage); // do not leak the WebGL context when the model fails to load
    throw e;
  }

  const show = (posed: PosedFigure) => {
    applyPose(rig, { local: posed.local, rootPosition: posed.rootPosition }, posed.scaleFactor);
    moving.update(posed.props);
    return posed;
  };
  const n = figure.frames.length;
  const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < n;

  return {
    stage,
    view,
    showFrame: (i) => {
      if (!valid(i)) throw new RangeError(`showFrame(${i}): frame index must be an integer in 0..${n - 1}`);
      return show(keyframes[i]!);
    },
    showBetween: (a, b, t) => {
      if (!valid(a) || !valid(b)) throw new RangeError(`showBetween(${a}, ${b}): frame indices must be integers in 0..${n - 1}`);
      // Play draws every animation frame: pose only, without validating (the sweep validates these poses).
      return show(figure.pose(sk, { from: a, to: b, t }, ctx, { validate: false }));
    },
    arrow: (i) => {
      const a = keyframes[i]?.arrow;
      return a ? { from: projectCm(stage, a.from), to: projectCm(stage, a.to) } : null;
    },
    render: () => renderStage(stage),
    resize: (w, h, pixelRatio) => resizeStage(stage, w, h, pixelRatio),
    dispose: () => {
      fixed.dispose();
      moving.dispose();
      disposeStage(stage);
    },
  };
}

/** Mount one equipment model alone (equipment views and stills), with its illustrative dimensions. */
export function mountEquipment(canvas: HTMLCanvasElement, opts: { width: number; height: number; model: EquipmentModel; pixelRatio?: number }): Omit<FigureScene, 'showFrame' | 'showBetween' | 'arrow'> {
  const stage = createStage(canvas, opts.width, opts.height, opts.pixelRatio);
  const eq = createEquipment('equipment');
  eq.update(opts.model.build().prims);
  stage.scene.add(eq.group);
  setOrbitView(stage, opts.model.view);
  return {
    stage,
    view: opts.model.view,
    render: () => renderStage(stage),
    resize: (w, h, pixelRatio) => resizeStage(stage, w, h, pixelRatio),
    dispose: () => {
      eq.dispose();
      disposeStage(stage);
    },
  };
}
