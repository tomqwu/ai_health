/** Public API of the planning engine (spec §7). Pure: no DOM, no storage, no Astro. */
export { checkFeasibility, type EngineOptions } from './feasibility';
export { ASSUMED_CEILING_CM, assumptions, type GeometryProbe, type ProbeRegistry, type ProbeResult, TYPICAL_STATURE_CM } from './geometry';
export { DEFAULT_PROBES } from './probes';
export { type DayPlan, estimateDay, fitToTime, type SlotPlan, type TimeEstimate, type Week, withEstimate } from './plan';
export { shortSession } from './shortSession';
export type { Feasibility, FeasibilityStatus, Reason, Unlock } from './types';
export { buildWeek } from './week';
