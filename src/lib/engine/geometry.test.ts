import { describe, expect, it } from 'vitest';
import type { Equipment } from '../content/schemas';
import type { Profile } from '../profile/schema';
import { ASSUMED_CEILING_CM, assumptions, checkGeometry, type GeometryProbe, type ProbeRegistry } from './geometry';
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
const tall = (statureCm: number, p: Profile = fullHomeGym()): Profile => ({ ...p, statureCm });
/** The synthetic catalog with the Smith station's content changed (not validated by buildCatalog). */
const smithCatalog = (change: (e: Equipment) => Partial<Equipment>) =>
  syntheticCatalog({ equipment: SYN_EQUIPMENT.map((e) => (e.id === 'smith-functional-trainer' ? { ...e, ...change(e) } : e)) });
const without = <V>(o: Readonly<Record<string, V>>, name: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== name));
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
      expect(seen).toEqual([175]);
    });
    it("poses at the user's own height when it is entered", () => {
      const seen: number[] = [];
      const probe: GeometryProbe = (input) => {
        seen.push(input.statureCm);
        return fixed()(input);
      };
      expect(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(probe))).toEqual(PASS);
      expect(seen).toEqual([172]);
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
    it("uses the user's own height, not the typical one", () => {
      // tall: 1.33 × 180 + 10 = 249.4 → 250 > 243.84, although the typical 175 cm gives 243 ≤ 243.84
      expect(checks(checkGeometry(ex('db-shoulder-press'), tall(180), catalog, {}))).toEqual(['ceiling']);
      expect(checkGeometry(ex('db-shoulder-press'), tall(175), catalog, {})).toEqual(PASS);
      // short, no ceiling entered: 1.33 × 165 + 10 = 229.45 → 230 ≤ 240 assumed, so no clearance note,
      // although the typical 175 cm needs 243 and gets one
      expect(checkGeometry(ex('db-shoulder-press'), tall(165, noCeiling(fullHomeGym())), catalog, {})).toEqual(PASS);
      expect(checkGeometry(ex('db-shoulder-press'), tall(175, noCeiling(fullHomeGym())), catalog, {}).notes.map((n) => n.key)).toEqual([
        'engine.note.checkClearance',
      ]);
      // top of a pull-up for a tall user: 210 + 0.13 × 190 + 10 = 244.7 → 245 > 243.84; typical: 243 fits
      expect(checks(checkGeometry(ex('pull-up'), tall(190), catalog, {}))).toEqual(['ceiling']);
      expect(checkGeometry(ex('pull-up'), tall(175), catalog, {})).toEqual(PASS);
    });
    it('passes when the need equals a measured ceiling', () => {
      const p: Profile = { ...fullHomeGym(), room: { ceilingHeightCm: 240, clearanceMarginCm: 10 } };
      expect(checkGeometry(ex('smith-squat'), p, catalog, smithProbes(fixed({ topCm: 230 })))).toEqual(PASS);
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
      // not a number: the typical 40 cm applies, and a bar at 35 cm is still checked against it
      const wrongType = withParams(fullHomeGym(), { smithLowestBarHeightCm: 'low' });
      expect(checkGeometry(ex('smith-squat'), wrongType, catalog, smithProbes(fixed({ barCentersCm: [35, 150] }))).reasons).toEqual([
        { check: 'bar-travel', message: { key: 'engine.reason.barBelowStop', params: { height: { lengthCm: 35 }, stop: { lengthCm: 40 } } } },
      ]);
    });
    it('passes a bar that reaches a stop exactly', () => {
      expect(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(fixed({ barCentersCm: [45, 185] })))).toEqual(PASS);
    });
    it('reports bar heights rounded outward, so the height never reads as the stop itself', () => {
      const o = checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(fixed({ barCentersCm: [44.6, 185.4] })));
      expect(o.reasons.map((r) => r.message.params?.height)).toEqual([{ lengthCm: 44 }, { lengthCm: 186 }]);
    });
    it('refuses a probe that reports no bar heights', () => {
      const noModel = [{ check: 'bar-travel', message: { key: 'engine.reason.noGeometryModel' } }];
      expect(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(fixed({ barCentersCm: [] }))).reasons).toEqual(noModel);
      expect(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(fixed({ barCentersCm: undefined }))).reasons).toEqual(noModel);
    });
    it('fails safe when a stop has neither a measured nor a usable typical value', () => {
      const unknown = [{ check: 'bar-travel', message: { key: 'engine.reason.stopsUnknown' } }];
      const run = (c: ReturnType<typeof syntheticCatalog>, p: Profile = nothingMeasured()) =>
        checkGeometry(ex('smith-squat'), p, c, smithProbes()).reasons;
      // the equipment does not define the highest stop
      const undefinedStop = smithCatalog((e) => ({
        parameters: without(e.parameters, 'smithHighestBarHeightCm'),
        illustrativeDefaults: without(e.illustrativeDefaults, 'smithHighestBarHeightCm'),
      }));
      expect(run(undefinedStop)).toEqual(unknown);
      // a typical value of the wrong type
      expect(run(smithCatalog((e) => ({ illustrativeDefaults: { ...e.illustrativeDefaults, smithLowestBarHeightCm: true } })))).toEqual(unknown);
      // no owned equipment defines the stops
      expect(run(catalog, { ...fullHomeGym(), equipment: fullHomeGym().equipment.filter((e) => e.id !== 'smith-functional-trainer') })).toEqual(
        unknown,
      );
    });
  });

  describe('bench fit', () => {
    it('uses the answer in the profile, else the typical one', () => {
      const run = (p: Profile) => checkGeometry(ex('smith-bench-press'), p, catalog, smithProbes());
      expect(run(fullHomeGym())).toEqual(PASS);
      expect(checks(run(withParams(fullHomeGym(), { benchFitsInsideRack: false })))).toEqual(['bench-fit']);
    });
    it('uses a typical answer of "does not fit" when there is no answer', () => {
      const doesNotFit = smithCatalog((e) => ({ illustrativeDefaults: { ...e.illustrativeDefaults, benchFitsInsideRack: false } }));
      const run = (p: Profile) => checkGeometry(ex('smith-bench-press'), p, doesNotFit, smithProbes()).reasons;
      expect(run(nothingMeasured())).toEqual([{ check: 'bench-fit', message: { key: 'engine.reason.benchFit' } }]);
      expect(run(withParams(nothingMeasured(), { benchFitsInsideRack: true }))).toEqual([]);
    });
    it('fails safe when there is neither an answer nor a usable typical one', () => {
      const unknown = [{ check: 'bench-fit', message: { key: 'engine.reason.benchFitUnknown' } }];
      const run = (c: ReturnType<typeof syntheticCatalog>) => checkGeometry(ex('smith-bench-press'), nothingMeasured(), c, smithProbes()).reasons;
      const undefinedFit = smithCatalog((e) => ({
        parameters: without(e.parameters, 'benchFitsInsideRack'),
        illustrativeDefaults: without(e.illustrativeDefaults, 'benchFitsInsideRack'),
      }));
      expect(run(undefinedFit)).toEqual(unknown);
      expect(run(smithCatalog((e) => ({ illustrativeDefaults: { ...e.illustrativeDefaults, benchFitsInsideRack: 'yes' } })))).toEqual(unknown);
    });
    it('does not apply to bench work outside the rack, or to rack work without a bench', () => {
      const p = withParams(fullHomeGym(), { benchFitsInsideRack: false });
      expect(checkGeometry(ex('db-bench-press'), p, catalog, {})).toEqual(PASS);
      // the pull-up is at the Smith station but uses no bench
      expect(checkGeometry(ex('pull-up'), p, catalog, {})).toEqual(PASS);
    });
  });
});
