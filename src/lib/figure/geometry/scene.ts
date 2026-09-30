import type { Vec3 } from '../math/vec3';
import { type BenchParams, buildBench, ILLUSTRATIVE_BENCH } from './bench';
import { type Built, emptyBuilt, FLOOR, mergeBuilt, placeBuilt } from './built';
import { buildBalanceTrainer, buildExerciseBall, buildFoamRoller, buildMassageBall } from './implements';
import { buildTrainer, ILLUSTRATIVE_TRAINER, type TrainerParams, type TrainerState } from './trainer';

/** Floor accessories a figure can place (they stay put during the exercise). */
export const FLOOR_ITEMS = { 'foam-roller': buildFoamRoller, 'massage-ball': buildMassageBall, 'exercise-ball': buildExerciseBall, 'balance-trainer': buildBalanceTrainer } as const;
export type FloorItem = keyof typeof FLOOR_ITEMS;

/**
 * The fixed equipment of a figure: what stands still while the body moves. Moving parts (the Smith bar
 * in a press, dumbbells, handles, cables) are props of each frame (see `props.ts`).
 */
export interface SceneSpec {
  /** The Smith machine + functional trainer, with its settings. */
  trainer?: TrainerState;
  /** The adjustable bench: floor point under the hinge, turn, and backrest angle. */
  bench?: { at: Vec3; yawDeg?: number; angleDeg: number };
  items?: ReadonlyArray<{ model: FloorItem; at: Vec3; yawDeg?: number }>;
}

/** Equipment dimensions a scene is drawn with. */
export interface SceneParams {
  trainer: TrainerParams;
  bench: BenchParams;
}

/** Typical dimensions (D12): what generic pages and pre-renders draw, labelled "illustrative". */
export const ILLUSTRATIVE_SCENE: SceneParams = { trainer: ILLUSTRATIVE_TRAINER, bench: ILLUSTRATIVE_BENCH };

/** Illustrative dimensions with some values replaced (e.g. the profile's pull-up bar height). */
export function sceneParamsWith(over: { trainer?: Partial<TrainerParams>; bench?: Partial<BenchParams> } = {}): SceneParams {
  return { trainer: { ...ILLUSTRATIVE_TRAINER, ...over.trainer }, bench: { ...ILLUSTRATIVE_BENCH, ...over.bench } };
}

/** The scene's fixed primitives, anchors (`floor` = the origin) and surfaces (`floor` always). */
export function buildScene(spec: SceneSpec, params: SceneParams = ILLUSTRATIVE_SCENE): Built {
  const parts: Built[] = [{ prims: [], anchors: { floor: [0, 0, 0] }, surfaces: { floor: FLOOR } }];
  if (spec.trainer) parts.push(buildTrainer(params.trainer, spec.trainer));
  if (spec.bench) parts.push(placeBuilt(buildBench(params.bench, spec.bench.angleDeg), { at: spec.bench.at, yawDeg: spec.bench.yawDeg }));
  for (const item of spec.items ?? []) parts.push(placeBuilt(FLOOR_ITEMS[item.model](), { at: item.at, yawDeg: item.yawDeg }));
  return parts.length ? mergeBuilt(...parts) : emptyBuilt();
}
