import type { Vec3 } from '../math/vec3';
import { buildBench, ILLUSTRATIVE_BENCH } from './bench';
import { type Built, cyl, cylAlong } from './built';
import { buildExerciseBike, buildRowingMachine, buildTreadmill } from './cardio';
import {
  buildAbWheel,
  buildAnkleStrap,
  buildBalanceTrainer,
  buildBand,
  buildBarbell,
  buildCloseGripHandle,
  buildDumbbell,
  buildExerciseBall,
  buildFoamRoller,
  buildLatBar,
  buildMassageBall,
  buildRope,
  buildSingleHandle,
  cableLine,
  AB_WHEEL,
  BARBELL,
  DUMBBELL,
} from './implements';
import { aabbOf, type Primitive } from './primitives';
import { buildTrainer, ILLUSTRATIVE_TRAINER } from './trainer';

/** How an equipment view looks at its model (cm; target is the orbit centre). */
export interface ModelView {
  azimuthDeg: number;
  elevationDeg: number;
  distanceCm: number;
  targetCm: Vec3;
}

/**
 * A parametric model that content refers to by id (`model3d` on equipment and attachments). `build`
 * draws it alone with illustrative dimensions, for equipment views and pre-rendered stills.
 */
export interface EquipmentModel {
  id: string;
  kind: 'equipment' | 'attachment';
  build(): Built;
  view: ModelView;
  /**
   * Content parameters this model draws, with the value it uses. The catalog requires the equipment's
   * illustrative defaults to match, so pages, figures and the engine all use the same typical values (D12).
   */
  drawsWith?: Readonly<Record<string, number | boolean>>;
}

const only = (prims: Primitive[]): Built => ({ prims, anchors: {}, surfaces: {} });
const PULLEY: Vec3 = [0, 150, -30];
const pulleyStub = (): Primitive[] => [cylAlong('still-pulley', PULLEY, [1, 0, 0], 3, 5, 'chrome'), cyl('still-pulley-post', [0, 150, -36], [0, 170, -36], 3, 'frame')];

/** An attachment shown hanging from its cable, which runs up to a pulley. */
const hung = (r: { prims: Primitive[]; attach: Vec3 }): Built => only([...pulleyStub(), cableLine('still-cable', PULLEY, r.attach), ...r.prims]);

/** Vertical field of view of the stage camera (deg) and the portrait 3:4 frame it renders into. */
const FOV_DEG = 30;
const ASPECT = 3 / 4;

/** A view that frames the whole model: aimed at its bounding box's centre, far enough back for its bounding sphere to fit. */
export function fitView(b: Built, azimuthDeg = 35, elevationDeg = 15): ModelView {
  const boxes = b.prims.map(aabbOf);
  const min = [0, 1, 2].map((i) => Math.min(...boxes.map((x) => x.min[i]!)));
  const max = [0, 1, 2].map((i) => Math.max(...boxes.map((x) => x.max[i]!)));
  const radius = Math.hypot(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!) / 2;
  const halfFov = Math.atan(Math.tan((FOV_DEG * Math.PI) / 360) * ASPECT);
  return { azimuthDeg, elevationDeg, distanceCm: Math.ceil(radius / Math.sin(halfFov)), targetCm: [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2] };
}

const model = (id: string, kind: EquipmentModel['kind'], build: () => Built, azimuthDeg = 35, elevationDeg = 15, drawsWith?: EquipmentModel['drawsWith']): EquipmentModel => ({
  id,
  kind,
  build,
  view: fitView(build(), azimuthDeg, elevationDeg),
  ...(drawsWith && { drawsWith }),
});
const T = ILLUSTRATIVE_TRAINER;

const LIST: EquipmentModel[] = [
  model('smith-functional-trainer', 'equipment', () => buildTrainer(ILLUSTRATIVE_TRAINER, { barHeightCm: 140, catchHeightCm: 70, pulleys: { left: 'chest', right: 'high' }, jHookHeightCm: 135, spotterArmHeightCm: 70 }), 35, 15, {
    smithLowestBarHeightCm: T.lowestBarHeightCm,
    smithHighestBarHeightCm: T.highestBarHeightCm,
    rackInnerDepthCm: T.rackInnerDepthCm,
    rackInnerWidthCm: T.rackInnerWidthCm,
    rackHeightCm: T.rackHeightCm,
    pullUpBarHeightCm: T.pullUpBarHeightCm,
  }),
  model('adjustable-bench', 'equipment', () => buildBench(ILLUSTRATIVE_BENCH, 30), 35, 15, { seatHeightCm: ILLUSTRATIVE_BENCH.seatHeightCm, backrestLengthCm: ILLUSTRATIVE_BENCH.backrestLengthCm }),
  model('dumbbells', 'equipment', () => only([...buildDumbbell('dumbbell-a', [-12, DUMBBELL.headRadiusCm, 0], [0, 0, 1]), ...buildDumbbell('dumbbell-b', [12, DUMBBELL.headRadiusCm, 0], [0, 0, 1])])),
  model('barbell', 'equipment', () => only(buildBarbell('barbell', [0, BARBELL.plateRadiusCm, 0]))),
  model('resistance-bands', 'equipment', () => only(buildBand('band', loop([0, 60, 0], 14, 45)))),
  model('treadmill', 'equipment', () => buildTreadmill()),
  model('rowing-machine', 'equipment', () => buildRowingMachine()),
  model('exercise-bike', 'equipment', () => buildExerciseBike()),
  model('foam-roller', 'equipment', () => buildFoamRoller()),
  model('massage-ball', 'equipment', () => buildMassageBall()),
  model('ab-wheel', 'equipment', () => only(buildAbWheel('ab-wheel', [0, AB_WHEEL.wheelRadiusCm, 0]))),
  model('exercise-ball', 'equipment', () => buildExerciseBall()),
  model('balance-trainer', 'equipment', () => buildBalanceTrainer()),
  model('rope', 'attachment', () => hung(buildRope('rope', [[9, 104, -30], [-9, 104, -30]], PULLEY))),
  model('close-grip-row-handle', 'attachment', () => hung(buildCloseGripHandle('close-grip', [[3.5, 118, -30], [-3.5, 118, -30]], [[0, 1, 0], [0, 1, 0]], PULLEY))),
  model('single-handle', 'attachment', () => hung(buildSingleHandle('single-handle', [0, 124, -30], [1, 0, 0], PULLEY))),
  model('lat-bar', 'attachment', () => hung(buildLatBar('lat-bar', [[30, 130, -30], [-30, 130, -30]], PULLEY))),
  model('ankle-strap', 'attachment', () => hung(buildAnkleStrap('ankle-strap', [0, 120, -30], [0, 1, 0], PULLEY))),
  model('row-footplate', 'attachment', () => part(buildTrainer(ILLUSTRATIVE_TRAINER, { footplate: true }), /^(footplate|upright-front-left|base-left)/), 50),
  model('roller-hold-down', 'attachment', () => part(buildTrainer(ILLUSTRATIVE_TRAINER, { holdDown: true }), /^(hold-down|upright-front-right|base-right)/), -50),
];

/** Every model by id. Content `model3d` ids must be keys here (checked by the catalog). */
export const EQUIPMENT_MODELS: Readonly<Record<string, EquipmentModel>> = Object.fromEntries(LIST.map((m) => [m.id, m]));

function loop(center: Vec3, halfWidth: number, halfHeight: number): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * 2 * Math.PI;
    pts.push([center[0] + halfWidth * Math.cos(a), center[1] + halfHeight * Math.sin(a), center[2]]);
  }
  return pts;
}

function part(b: Built, keep: RegExp): Built {
  return { prims: b.prims.filter((p) => keep.test(p.id)), anchors: {}, surfaces: {} };
}
