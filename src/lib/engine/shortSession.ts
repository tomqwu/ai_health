import { type DayPlan, withEstimate } from './plan';

export const SHORT_SESSION_MAX_SLOTS = 3;
export const SHORT_SESSION_SETS = 2;
export const SHORT_SESSION_MIN_RIR = 3;

/**
 * Spec §7.4: for poor sleep, little time or incomplete recovery. Keeps up to three filled priority-1
 * slots in day order, at most 2 sets each, RIR raised to at least 3 (slots without an RIR target, such
 * as cardio, keep none). A superset survives only if both partners are kept.
 */
export function shortSession(day: DayPlan): DayPlan {
  const kept = day.slots.filter((s) => s.priority === 1 && s.pick).slice(0, SHORT_SESSION_MAX_SLOTS);
  const indexes = new Set(kept.map((s) => s.index));
  const slots = kept.map((s) => ({
    ...s,
    sets: Math.min(s.sets, SHORT_SESSION_SETS),
    rir: s.rir === undefined ? undefined : Math.max(s.rir, SHORT_SESSION_MIN_RIR),
    supersetWith: s.supersetWith !== undefined && indexes.has(s.supersetWith) ? s.supersetWith : undefined,
  }));
  return withEstimate({ ...day, slots });
}
