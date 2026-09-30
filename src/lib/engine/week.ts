import type { Catalog } from '../content/catalog';
import { type Day, type Exercise, slotPatterns, type Template } from '../content/schemas';
import { LIMITATION_JOINT, type Limitation } from '../content/vocab';
import type { Message } from '../i18n/format';
import type { Profile } from '../profile/schema';
import { checkFeasibility, type EngineOptions } from './feasibility';
import { assumptions } from './geometry';
import { compareIds } from './order';
import { type DayPlan, type SlotPlan, type Week, withEstimate } from './plan';
import type { Feasibility, Unlock } from './types';

export interface Ranked {
  exercise: Exercise;
  score: number;
  why: Message[];
}

export interface RankContext {
  /** The previous pick of the day, if any. */
  previous?: Exercise;
  limitations: readonly Limitation[];
  /** Exercise ids already picked earlier in the week. */
  used: ReadonlySet<string>;
}

/**
 * Spec §7.2 ranking, highest first, ties broken by id:
 * +3 same station as the previous pick of the day; +2 per declared limitation whose joint has low
 * stress; −3 per declared limitation whose joint has high stress; −2 if already used this week.
 */
export function rankCandidates(candidates: readonly Exercise[], ctx: RankContext): Ranked[] {
  return candidates
    .map((exercise) => {
      let score = 0;
      const why: Message[] = [{ key: 'engine.why.fits' }];
      if (ctx.previous && ctx.previous.setupState.station === exercise.setupState.station) {
        score += 3;
        why.push({ key: 'engine.why.sameStation' });
      }
      for (const lim of ctx.limitations) {
        const joint = LIMITATION_JOINT[lim];
        const level = exercise.jointStress[joint];
        if (level === 'low') {
          score += 2;
          why.push({ key: 'engine.why.easyOnJoint', params: { joint: { key: `joint.${joint}` } } });
        } else if (level === 'high') {
          score -= 3;
          why.push({ key: 'engine.why.hardOnJoint', params: { joint: { key: `joint.${joint}` } } });
        }
      }
      if (ctx.used.has(exercise.id)) {
        score -= 2;
        why.push({ key: 'engine.why.usedEarlier' });
      }
      return { exercise, score, why };
    })
    .sort((a, b) => b.score - a.score || compareIds(a.exercise.id, b.exercise.id));
}

/** Safety notes for a pick that loads a joint the user marked as sensitive (spec §7.1, §12). */
export function limitationNotes(exercise: Exercise, limitations: readonly Limitation[]): Message[] {
  return limitations.flatMap((lim): Message[] => {
    const joint = LIMITATION_JOINT[lim];
    const level = exercise.jointStress[joint];
    if (level === 'low') return [];
    return [{ key: level === 'high' ? 'engine.note.jointHigh' : 'engine.note.jointModerate', params: { joint: { key: `joint.${joint}` } } }];
  });
}

const unique = <T>(items: readonly T[]): T[] => {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = JSON.stringify(i);
    return !seen.has(k) && seen.add(k);
  });
};

/** Spec §7.2 step 4: why nothing fits, and what would unlock the slot. */
function emptyReasons(matching: readonly Exercise[], feas: (e: Exercise) => Feasibility): NonNullable<SlotPlan['empty']> {
  if (matching.length === 0) return { reasons: [{ key: 'engine.empty.noExercise' }], unlock: [] };
  const results = matching.map(feas);
  const reasons = unique(results.flatMap((r) => r.reasons.map((x) => x.message)));
  const unlock: Unlock[] = unique(results.flatMap((r) => r.reasons.flatMap((x) => (x.unlock ? [x.unlock] : []))));
  return { reasons: [{ key: 'engine.empty.noneFeasible' }, ...reasons], unlock };
}

function budgetFor(day: Day, profile: Profile): number {
  if (day.kind === 'rest') return 0;
  return Math.min(day.minutes ?? profile.schedule.sessionMinutes, profile.schedule.sessionMinutes);
}

/**
 * Spec §7.2: fill every slot of every day. Candidates match the slot's pattern and are feasible; a
 * still-feasible user override wins; unfillable slots stay, with reasons. Supersets are kept only when
 * both picks share a station. Unknown inputs use typical values (D12), listed in `assumptions`.
 * Deterministic for the same inputs.
 */
export function buildWeek(template: Template, profile: Profile, catalog: Catalog, opts: EngineOptions = {}): Week {
  const cache = new Map<string, Feasibility>();
  const feas = (e: Exercise): Feasibility => {
    let r = cache.get(e.id);
    if (!r) cache.set(e.id, (r = checkFeasibility(e, profile, catalog, opts)));
    return r;
  };
  const all = [...catalog.exercises.values()];
  const used = new Set<string>();

  const days = template.days.map((day): DayPlan => {
    let previous: Exercise | undefined;
    const slots = day.slots.map((slot, index): SlotPlan => {
      const key = `${day.weekday}/${index}`;
      const patterns = slotPatterns(slot);
      const matching = all.filter((e) => patterns.includes(e.pattern));
      const feasible = matching.filter((e) => feas(e).status === 'feasible');
      const ranked = rankCandidates(feasible, { previous, limitations: profile.limitations, used });
      const notices: Message[] = [];

      let pick = ranked[0]?.exercise;
      let why = ranked[0]?.why ?? [];
      const overrideId = profile.schedule.overrides[key];
      if (overrideId !== undefined) {
        const chosen = catalog.exercises.get(overrideId);
        if (!chosen || !patterns.includes(chosen.pattern)) {
          notices.push({ key: 'engine.notice.overrideInvalid' });
        } else if (feas(chosen).status !== 'feasible') {
          notices.push({ key: 'engine.notice.overrideDropped', params: { exercise: chosen.name } });
        } else {
          pick = chosen;
          why = [{ key: 'engine.why.override' }];
        }
      }

      const plan: SlotPlan = {
        key,
        index,
        patterns,
        sets: slot.sets,
        reps: slot.reps,
        rir: slot.rir,
        restSec: slot.restSec,
        priority: slot.priority,
        supersetWith: slot.supersetWith,
        pick,
        why: pick ? why : [],
        notes: pick ? [...feas(pick).notes, ...limitationNotes(pick, profile.limitations)] : [],
        notices,
        alternatives: ranked.map((r) => r.exercise.id).filter((id) => id !== pick?.id),
        empty: pick ? undefined : emptyReasons(matching, feas),
      };
      if (pick) {
        previous = pick;
        used.add(pick.id);
      }
      return plan;
    });

    // Keep a superset only when both picks share a station (spec §5.5).
    const byIndex = new Map(slots.map((s) => [s.index, s]));
    const paired = slots.map((s) => {
      if (s.supersetWith === undefined) return s;
      const partner = byIndex.get(s.supersetWith);
      const keep = s.pick && partner?.pick && s.pick.setupState.station === partner.pick.setupState.station;
      return keep ? s : { ...s, supersetWith: undefined };
    });

    return withEstimate({ weekday: day.weekday, kind: day.kind, focus: day.focus, budgetMinutes: budgetFor(day, profile), slots: paired });
  });

  return { templateId: template.id, assumptions: assumptions(profile), days };
}
