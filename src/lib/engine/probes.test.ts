import { describe, expect, it } from 'vitest';
import { SMITH_SQUAT } from '../figure/fixtures/smith-squat';
import { ILLUSTRATIVE_SMITH } from '../figure/geometry/smith';
import { checkFigureFrame } from '../figure/pose/checkFigureFrame';
import { syntheticSkeleton } from '../figure/pose/synthetic';
import type { Profile } from '../profile/schema';
import { checkGeometry } from './geometry';
import { DEFAULT_PROBES, smithSquatProbe } from './probes';
import { fullHomeGym, nothingMeasured, syntheticCatalog } from './testing/fixtures';

const STATURES = [150, 165, 175, 190, 200];

describe('smithSquatProbe', () => {
  const probes = { real: DEFAULT_PROBES['smith-squat']!, synthetic: smithSquatProbe(syntheticSkeleton({ randomRestSeed: 5 }), SMITH_SQUAT) };

  for (const [skeleton, probe] of Object.entries(probes)) {
    it.each(STATURES)(`${skeleton} skeleton: poses all three frames cleanly at %i cm`, (statureCm) => {
      const r = probe({ statureCm });
      expect(r.rom).toEqual([]);
      expect(r.posing).toEqual([]);
      expect(r.barCentersCm).toHaveLength(3);
      // The head is the highest point; plates never rise above it in a back squat.
      expect(r.topCm).toBeGreaterThan(statureCm * 0.95);
      expect(r.topCm).toBeLessThan(statureCm + 5);
    });
  }

  it('lowers the bar at the bottom frame and scales with stature', () => {
    const short = probes.real({ statureCm: 150 }).barCentersCm!;
    const tall = probes.real({ statureCm: 200 }).barCentersCm!;
    expect(short[1]!).toBeLessThan(short[0]!);
    expect(tall[0]!).toBeGreaterThan(short[0]!);
    expect(tall[1]!).toBeGreaterThan(short[1]!);
  });

  it('reports bar-centre heights, the datum of the stops and SmithParams', () => {
    const sk = syntheticSkeleton({ randomRestSeed: 5 });
    const r = smithSquatProbe(sk, SMITH_SQUAT)({ statureCm: 175 });
    SMITH_SQUAT.frames.forEach((frame, i) => {
      const { solution } = checkFigureFrame(sk, SMITH_SQUAT, frame, { statureCm: 175, smith: ILLUSTRATIVE_SMITH });
      expect(r.barCentersCm![i]).toBeCloseTo(solution.barCenter[1], 6);
    });
  });

  it('passes the pose layer ROM findings through, per frame', () => {
    const narrow = { ...SMITH_SQUAT, grip: { ...SMITH_SQUAT.grip, halfWidthCm: 20 } };
    const r = smithSquatProbe(syntheticSkeleton(), narrow)({ statureCm: 190 });
    expect(r.rom.some((m) => m.startsWith('unrack: elbowFlex_'))).toBe(true);
    expect(r.posing).toEqual([]);
  });

  it('throws when a frame cannot be solved', () => {
    const far = { ...SMITH_SQUAT, stance: { ...SMITH_SQUAT.stance, forwardOfRailCm: 150 } };
    expect(() => smithSquatProbe(syntheticSkeleton(), far)({ statureCm: 175 })).toThrow(/no trunk angle/);
  });
});

describe('checkGeometry with the default probes', () => {
  const catalog = syntheticCatalog();
  const squat = catalog.exercises.get('smith-squat')!;
  const withLowest = (cm: number): Profile => {
    const p = fullHomeGym();
    return { ...p, equipment: p.equipment.map((e) => (e.id === 'smith-functional-trainer' ? { ...e, params: { ...e.params, smithLowestBarHeightCm: cm } } : e)) };
  };

  it('passes the Smith squat for a synthetic user with height and ceiling entered', () => {
    expect(checkGeometry(squat, fullHomeGym(), catalog, DEFAULT_PROBES)).toEqual({ reasons: [], notes: [] });
  });
  it('passes it at a typical height on the typical machine (D12)', () => {
    expect(checkGeometry(squat, nothingMeasured(), catalog, DEFAULT_PROBES)).toEqual({ reasons: [], notes: [] });
  });
  it('fails it when the lowest stop is above the bottom of the squat', () => {
    const o = checkGeometry(squat, withLowest(130), catalog, DEFAULT_PROBES);
    expect(o.reasons.map((r) => r.message.key)).toEqual(['engine.reason.barBelowStop']);
  });
});
