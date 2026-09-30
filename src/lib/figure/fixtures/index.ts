import { type FigureModel, poseFigure, smithSquatFigure } from '../figures';
import type { PoseFigureSpec } from '../pose/poseSpec';
import { DB_CURL } from './db-curl';
import { DB_INCLINE_PRESS } from './db-incline-press';
import { DB_SHOULDER_PRESS } from './db-shoulder-press';
import { SMITH_BENCH_PRESS } from './smith-bench-press';
import { SMITH_SQUAT } from './smith-squat';

/** Generalized pose specs, one per exercise figure (see docs/figure-pipeline.md). */
export const POSE_SPECS: readonly PoseFigureSpec[] = [DB_CURL, SMITH_BENCH_PRESS, DB_INCLINE_PRESS, DB_SHOULDER_PRESS];

/** Every figure the renderer, viewer, engine and sweep know, by id: the M1 Smith squat plus the pose library. */
export const FIGURES: Readonly<Record<string, FigureModel>> = Object.fromEntries(
  [smithSquatFigure(SMITH_SQUAT), ...POSE_SPECS.map(poseFigure)].map((f) => [f.id, f]),
);
