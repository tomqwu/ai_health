import { describe, expect, it } from 'vitest';
import type { Profile } from '../profile/schema';
import { ASSUMED_CEILING_CM, assumptions, checkGeometry, type GeometryProbe, type ProbeRegistry, TYPICAL_STATURE_CM } from './geometry';
import { EIGHT_FT_CEILING_CM, fullHomeGym, lowCeiling, nothingMeasured, SYN_EQUIPMENT, syntheticCatalog } from './testing/fixtures';

const catalog = syntheticCatalog();
const ex = (id: string) => catalog.exercises.get(id)!;
const PASS = { reasons: [], notes: [] };

/** A fixed pose result, independent of the pose layer. */
const fixed = (over: Partial<ReturnType<GeometryProbe>> = {}): GeometryProbe => () => ({
  topCm: 180,
  barCentersCm: [90, 150],
  rom: [],
  posing: [],
  ...over,
});
const smithProbes = (probe: GeometryProbe = fixed()): ProbeRegistry => ({ 'smith-squat': probe, 'smith-bench-press': probe });

const withParams = (p: Profile, params: Record<string, unknown>): Profile => ({
  ...p,
  equipment: p.equipment.map((e) => (e.id === 'smith-functional-trainer' ? { ...e, params: { ...e.params, ...params } as typeof e.params } : e)),
});
const noCeiling = (p: Profile): Profile => ({ ...p, room: { clearanceMarginCm: 10 } });
const checks = (o: ReturnType<typeof checkGeometry>) => o.reasons.map((r) => r.check);

describe('checkGeometry', () => {
  it('passes a profile with height and ceiling entered', () => {
    expect(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes())).toEqual(PASS);
  });

  describe('typical values (D12)', () => {
    it('poses at a typical 175 cm when the height is unknown', () => {
      const seen: number[] = [];
      const probe: GeometryProbe = (input) => {
        seen.push(input.statureCm);
        return fixed()(input);
      };
      expect(checkGeometry(ex('smith-squat'), nothingMeasured(), catalog, smithProbes(probe))).toEqual(PASS);
      expect(seen).toEqual([TYPICAL_STATURE_CM]);
    });
    it('says which typical values stand in for unknown inputs', () => {
      expect(assumptions(fullHomeGym())).toEqual([]);
      expect(assumptions(nothingMeasured())).toEqual([
        { key: 'engine.assumed.stature', params: { height: { lengthCm: 175 } } },
        { key: 'engine.assumed.ceiling', params: { ceiling: { lengthCm: 240 } } },
      ]);
    });
  });

  describe('pose', () => {
    it('refuses Smith exercises that have no probe', () => {
      const o = checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, {});
      expect(o.reasons).toEqual([{ check: 'bar-travel', message: { key: 'engine.reason.noGeometryModel' } }]);
    });
    it('reports a probe that cannot pose the exercise cleanly', () => {
      const throwing: GeometryProbe = () => {
        throw new Error('no trunk angle');
      };
      expect(checks(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(throwing)))).toEqual(['pose']);
      const offTarget = fixed({ posing: ['bottom: foot_l is 3.0 cm from its target'] });
      expect(checks(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(offTarget)))).toEqual(['pose']);
    });
    it('reports joints past their range of motion', () => {
      const rom = fixed({ rom: ['bottom: kneeFlex_l at 152° exceeds 150°'] });
      expect(checks(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(rom)))).toEqual(['rom']);
    });
  });

  describe('ceiling', () => {
    it('fails when the envelope plus margin exceeds an entered ceiling', () => {
      expect(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(fixed({ topCm: 240.2 })))).toEqual({
        reasons: [
          {
            check: 'ceiling',
            message: { key: 'engine.reason.ceiling', params: { need: { lengthCm: 251 }, margin: { lengthCm: 10 }, ceiling: { lengthCm: EIGHT_FT_CEILING_CM } } },
          },
        ],
        notes: [],
      });
    });
    it('assumes a 240 cm ceiling when none is entered, and notes clearance instead of failing', () => {
      const p = noCeiling(fullHomeGym());
      expect(checkGeometry(ex('smith-squat'), p, catalog, smithProbes(fixed({ topCm: 230 })))).toEqual(PASS);
      expect(checkGeometry(ex('smith-squat'), p, catalog, smithProbes(fixed({ topCm: 230.5 })))).toEqual({
        reasons: [],
        notes: [
          { key: 'engine.note.checkClearance', params: { need: { lengthCm: 241 }, margin: { lengthCm: 10 }, ceiling: { lengthCm: ASSUMED_CEILING_CM } } },
        ],
      });
    });
    it('uses overhead reach for vertical pushes without a probe', () => {
      // 1.33 × 188 + 10 = 260.04 > 225
      expect(checks(checkGeometry(ex('db-shoulder-press'), lowCeiling(), catalog, {}))).toEqual(['ceiling']);
      // 1.33 × 172 + 10 = 238.76 ≤ 243.84
      expect(checkGeometry(ex('db-shoulder-press'), fullHomeGym(), catalog, {})).toEqual(PASS);
      // typical height: 1.33 × 175 + 10 = 242.75 → 243 > 240 assumed: a note, not a failure
      const typical = checkGeometry(ex('db-shoulder-press'), nothingMeasured(), catalog, {});
      expect(typical.reasons).toEqual([]);
      expect(typical.notes.map((n) => n.key)).toEqual(['engine.note.checkClearance']);
      // standing: 188 + 10 ≤ 225
      expect(checkGeometry(ex('goblet-squat'), lowCeiling(), catalog, {})).toEqual(PASS);
    });
    it('uses the pull-up bar height, measured or typical, for hanging exercises', () => {
      // typical bar: 210 + 0.13 × 172 + 10 = 242.36 ≤ 243.84
      expect(checkGeometry(ex('pull-up'), fullHomeGym(), catalog, {})).toEqual(PASS);
      // measured bar: 230 + 22.36 + 10 > 243.84
      expect(checks(checkGeometry(ex('pull-up'), withParams(fullHomeGym(), { pullUpBarHeightCm: 230 }), catalog, {}))).toEqual(['ceiling']);
    });
    it('falls back to overhead reach when no owned equipment defines a pull-up bar height', () => {
      const bare = syntheticCatalog({ equipment: SYN_EQUIPMENT.map((e) => ({ ...e, parameters: {}, illustrativeDefaults: {} })) });
      // 1.33 × 172 + 10 = 238.76 ≤ 243.84; the stored 230 cm is ignored because no equipment defines it
      expect(checkGeometry(ex('pull-up'), withParams(fullHomeGym(), { pullUpBarHeightCm: 230 }), bare, {})).toEqual(PASS);
    });
    it('uses the profile clearance margin', () => {
      const p: Profile = { ...fullHomeGym(), room: { ceilingHeightCm: EIGHT_FT_CEILING_CM, clearanceMarginCm: 30 } };
      // 1.33 × 172 + 30 = 258.76 > 243.84
      expect(checks(checkGeometry(ex('db-shoulder-press'), p, catalog, {}))).toEqual(['ceiling']);
    });
  });

  describe('Smith bar travel', () => {
    it('fails below the lowest stop and above the highest stop', () => {
      const p = withParams(fullHomeGym(), { smithLowestBarHeightCm: 100, smithHighestBarHeightCm: 140 });
      expect(checkGeometry(ex('smith-squat'), p, catalog, smithProbes()).reasons).toEqual([
        { check: 'bar-travel', message: { key: 'engine.reason.barBelowStop', params: { height: { lengthCm: 90 }, stop: { lengthCm: 100 } } } },
        { check: 'bar-travel', message: { key: 'engine.reason.barAboveStop', params: { height: { lengthCm: 150 }, stop: { lengthCm: 140 } } } },
      ]);
    });
    it('uses the typical stops when none are measured', () => {
      const o = checkGeometry(ex('smith-squat'), nothingMeasured(), catalog, smithProbes(fixed({ barCentersCm: [30, 185] })));
      expect(o.reasons).toEqual([
        { check: 'bar-travel', message: { key: 'engine.reason.barBelowStop', params: { height: { lengthCm: 30 }, stop: { lengthCm: 40 } } } },
        { check: 'bar-travel', message: { key: 'engine.reason.barAboveStop', params: { height: { lengthCm: 185 }, stop: { lengthCm: 180 } } } },
      ]);
    });
    it('prefers a measured stop, and treats a stored value of the wrong type as unmeasured', () => {
      const probes = smithProbes(fixed({ barCentersCm: [42, 150] }));
      // measured lowest stop 45 cm
      expect(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, probes).reasons.map((r) => r.message)).toEqual([
        { key: 'engine.reason.barBelowStop', params: { height: { lengthCm: 42 }, stop: { lengthCm: 45 } } },
      ]);
      // not a number: the typical 40 cm applies
      expect(checkGeometry(ex('smith-squat'), withParams(fullHomeGym(), { smithLowestBarHeightCm: 'low' }), catalog, probes)).toEqual(PASS);
    });
  });

  describe('bench fit', () => {
    it('uses the answer in the profile, else the typical one', () => {
      const run = (p: Profile) => checkGeometry(ex('smith-bench-press'), p, catalog, smithProbes());
      expect(run(fullHomeGym())).toEqual(PASS);
      expect(checks(run(withParams(fullHomeGym(), { benchFitsInsideRack: false })))).toEqual(['bench-fit']);
    });
    it('does not apply to bench work outside the rack', () => {
      const p = withParams(fullHomeGym(), { benchFitsInsideRack: false });
      expect(checkGeometry(ex('db-bench-press'), p, catalog, {})).toEqual(PASS);
    });
  });
});
