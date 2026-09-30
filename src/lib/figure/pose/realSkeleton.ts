import skeletonJson from './skeleton.json';
import type { SkeletonDef } from './skeleton';

/**
 * The committed human model's skeleton (`skeleton.json`, written by `npm run build:human`).
 * JSON imports type tuples as number[], so the one cast to SkeletonDef lives here.
 */
export const REAL_SKELETON: SkeletonDef = skeletonJson as unknown as SkeletonDef;
