/**
 * M2 exit criterion (spec §16): the engine end to end on synthetic profiles. Invariants hold for every
 * profile; a few concrete expectations pin the behaviour of each.
 */
import { describe, expect, it } from 'vitest';
import { formatMessage, type Message } from '../i18n/format';
import type { Profile } from '../profile/schema';
import { checkFeasibility, fitToTime, shortSession } from './index';
import { buildWeek } from './week';
import { dumbbellsOnly, fullHomeGym, lowCeiling, nothingMeasured, SYN_TEMPLATE, syntheticCatalog } from './testing/fixtures';

const catalog = syntheticCatalog();
const PROFILES: Record<string, () => Profile> = { fullHomeGym, dumbbellsOnly, nothingMeasured, lowCeiling };

describe.each(Object.entries(PROFILES))('synthetic profile %s', (_name, make) => {
  const profile = make();
  const week = buildWeek(SYN_TEMPLATE, profile, catalog);
  const slots = week.days.flatMap((d) => d.slots);

  it('never picks an exercise that is not feasible', () => {
    for (const s of slots) if (s.pick) expect(checkFeasibility(s.pick, profile, catalog).status, s.key).toBe('feasible');
  });
  it('only picks exercises of the slot pattern, and explains every empty slot', () => {
    for (const s of slots) {
      if (s.pick) expect(s.patterns, s.key).toContain(s.pick.pattern);
      else expect(s.empty?.reasons.length, s.key).toBeGreaterThan(0);
    }
  });
  it('lists only feasible alternatives', () => {
    for (const s of slots) {
      for (const id of s.alternatives) expect(checkFeasibility(catalog.exercises.get(id)!, profile, catalog).status, `${s.key} ${id}`).toBe('feasible');
    }
  });
  it('fit to time never removes priority-1 slots', () => {
    for (const d of week.days) {
      const fitted = fitToTime(d);
      const p1 = (x: typeof d) => x.slots.filter((s) => s.priority === 1).map((s) => [s.index, s.sets]);
      expect(p1(fitted)).toEqual(p1(d));
    }
  });
  it('short sessions keep at most three slots at 2 sets and RIR ≥ 3', () => {
    for (const d of week.days) {
      const short = shortSession(d);
      expect(short.slots.length).toBeLessThanOrEqual(3);
      for (const s of short.slots) {
        expect(s.sets).toBeLessThanOrEqual(2);
        if (s.rir !== undefined) expect(s.rir).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it('emits only messages that format in both languages', () => {
    const emitted: Message[] = [
      ...week.assumptions,
      ...slots.flatMap((s) => [...s.why, ...s.notes, ...s.notices, ...(s.empty?.reasons ?? [])]),
      ...[...catalog.exercises.values()].flatMap((ex) => {
        const f = checkFeasibility(ex, profile, catalog);
        return [...f.reasons.map((r) => r.message), ...f.notes];
      }),
    ];
    expect(emitted.length).toBeGreaterThan(0);
    for (const m of emitted) {
      for (const locale of ['en', 'zh'] as const) {
        for (const length of ['cm', 'in'] as const) expect(formatMessage(locale, m, { length }), `${locale} ${m.key}`).not.toMatch(/[{}]/);
      }
    }
  });
  it('is deterministic and serializable', () => {
    expect(JSON.parse(JSON.stringify(buildWeek(SYN_TEMPLATE, profile, catalog)))).toEqual(JSON.parse(JSON.stringify(week)));
  });
});

describe('scenario expectations', () => {
  const filled = (p: Profile) =>
    buildWeek(SYN_TEMPLATE, p, catalog)
      .days.flatMap((d) => d.slots)
      .filter((s) => s.pick)
      .map((s) => s.key);

  it('a full home gym fills every slot except cardio without a treadmill', () => {
    expect(filled(fullHomeGym())).toEqual(['mon/0', 'mon/1', 'mon/2', 'mon/3', 'tue/0', 'tue/1', 'tue/2', 'thu/0', 'thu/1']);
  });
  it('dumbbells only: no cable or Smith work, no vertical pull', () => {
    expect(filled(dumbbellsOnly())).toEqual(['mon/0', 'mon/1', 'mon/3', 'tue/0', 'tue/1', 'tue/2', 'thu/1']);
  });
  it('a profile with nothing entered is planned at typical values (D12)', () => {
    expect(filled(nothingMeasured())).toEqual(filled(fullHomeGym()));
    const week = buildWeek(SYN_TEMPLATE, nothingMeasured(), catalog);
    expect(week.assumptions.map((m) => m.key)).toEqual(['engine.assumed.stature', 'engine.assumed.ceiling']);
    const overhead = week.days[0]!.slots[1]!;
    expect(overhead.notes.map((m) => m.key)).toEqual(['engine.note.checkClearance']);
  });
  it('a low ceiling rules out overhead pressing but keeps the rest', () => {
    expect(filled(lowCeiling())).not.toContain('mon/1');
    expect(filled(lowCeiling())).toContain('mon/0');
  });
});
