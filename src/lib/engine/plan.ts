import type { Exercise, Reps, SetupState } from '../content/schemas';
import type { DayKind, Pattern, Weekday } from '../content/vocab';
import type { Message } from '../i18n/format';
import type { I18nText } from '../i18n/locales';
import type { Unlock } from './types';

/** The "warm-up" term of spec §7.3: a general warm-up before every day with at least one exercise. */
export const WARMUP_SEC = 300;

export interface SlotPlan {
  /** "mon/0": weekday + the slot's template index (the override key, spec §6). */
  key: string;
  /** The slot's index in the template day; stays stable when other slots are removed. */
  index: number;
  patterns: readonly Pattern[];
  sets: number;
  reps: Reps;
  rir?: number;
  restSec: number;
  priority: 1 | 2 | 3;
  /** Template index of the superset partner; present only when both picks share a station. */
  supersetWith?: number;
  /** The chosen exercise; undefined for an unfillable slot. */
  pick?: Exercise;
  /** Why this pick won (spec §9.1 "why it was chosen"). */
  why: Message[];
  /** Non-blocking notes: overhead clearance under an assumed ceiling (D12), then safety notes from declared limitations. */
  notes: Message[];
  /** Things the user should know, e.g. a dropped override. */
  notices: Message[];
  /** Other feasible exercise ids for ⇄ swap, best first. */
  alternatives: string[];
  /** Set when nothing feasible fills the slot. */
  empty?: { reasons: Message[]; unlock: Unlock[] };
}

export interface TimeEstimate {
  warmupSec: number;
  workSec: number;
  restSec: number;
  transitionSec: number;
  totalSec: number;
  /** totalSec rounded up to whole minutes. */
  minutes: number;
}

export interface DayPlan {
  weekday: Weekday;
  kind: DayKind;
  focus?: I18nText;
  budgetMinutes: number;
  slots: SlotPlan[];
  estimate: TimeEstimate;
  overBudget: boolean;
}

export interface Week {
  templateId: string;
  /** Typical values standing in for unknown inputs, e.g. "planned for a typical height" (D12). */
  assumptions: Message[];
  days: DayPlan[];
}

/**
 * Seconds of work in one set. A rep range is charged at its top, so estimates err long; holds use their
 * seconds; unilateral exercises are done once per side.
 */
export function setWorkSec(reps: Reps, ex: Exercise): number {
  const perSide = Array.isArray(reps) ? reps[1] * ex.repSeconds : reps.seconds;
  return ex.tags.includes('unilateral') ? 2 * perSide : perSide;
}

/** Spec §7.3: a transition is charged when station, bench angle or pulley height changes. */
export function sameSetup(a: SetupState, b: SetupState): boolean {
  return a.station === b.station && a.benchAngleDeg === b.benchAngleDeg && a.pulley === b.pulley;
}

/** Template indexes of the first slot of each superset pair that is present and filled. */
function supersetLeaders(slots: readonly SlotPlan[]): Set<number> {
  const filled = new Set(slots.filter((s) => s.pick).map((s) => s.index));
  const leaders = new Set<number>();
  for (const s of slots) {
    if (s.supersetWith === undefined || !filled.has(s.index) || !filled.has(s.supersetWith)) continue;
    leaders.add(Math.min(s.index, s.supersetWith));
  }
  return leaders;
}

/**
 * Spec §7.3: warm-up + Σ sets × (reps × repSeconds + restSec) + transitions. In a kept superset the
 * first exercise's rest is skipped: you go straight to its partner.
 */
export function estimateDay(slots: readonly SlotPlan[]): TimeEstimate {
  const leaders = supersetLeaders(slots);
  let workSec = 0;
  let restSec = 0;
  let transitionSec = 0;
  let prev: SetupState | undefined;
  for (const s of slots) {
    if (!s.pick) continue;
    if (!prev || !sameSetup(prev, s.pick.setupState)) transitionSec += s.pick.setupSeconds;
    prev = s.pick.setupState;
    workSec += s.sets * setWorkSec(s.reps, s.pick);
    if (!leaders.has(s.index)) restSec += s.sets * s.restSec;
  }
  const warmupSec = prev ? WARMUP_SEC : 0;
  const totalSec = warmupSec + workSec + restSec + transitionSec;
  return { warmupSec, workSec, restSec, transitionSec, totalSec, minutes: Math.ceil(totalSec / 60) };
}

/** A day with its estimate and budget flag recomputed. */
export function withEstimate(day: Omit<DayPlan, 'estimate' | 'overBudget'>): DayPlan {
  const estimate = estimateDay(day.slots);
  return { ...day, estimate, overBudget: estimate.minutes > day.budgetMinutes };
}

/** Remove slot at array position `i`, and any superset link to it. */
function removeSlot(slots: readonly SlotPlan[], i: number): SlotPlan[] {
  const gone = slots[i]!.index;
  return slots
    .filter((_, j) => j !== i)
    .map((s) => (s.supersetWith === gone ? { ...s, supersetWith: undefined } : s));
}

/**
 * Spec §7.3 "fit to time": remove priority-3 slots (last first), then trim priority-2 slots one set at
 * a time (the slot with the most sets first, later slots on ties; never below one set). Priority-1
 * slots are never touched. Returns the day unchanged when it already fits.
 */
export function fitToTime(day: DayPlan): DayPlan {
  let current = day;
  while (current.overBudget) {
    const i = current.slots.findLastIndex((s) => s.priority === 3);
    if (i < 0) break;
    current = withEstimate({ ...current, slots: removeSlot(current.slots, i) });
  }
  while (current.overBudget) {
    let best = -1;
    current.slots.forEach((s, i) => {
      if (s.priority === 2 && s.sets > 1 && (best < 0 || s.sets >= current.slots[best]!.sets)) best = i;
    });
    if (best < 0) break;
    current = withEstimate({ ...current, slots: current.slots.map((s, i) => (i === best ? { ...s, sets: s.sets - 1 } : s)) });
  }
  return current;
}
