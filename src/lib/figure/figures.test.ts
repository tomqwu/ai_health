import { describe, expect, it } from 'vitest';
import { distance } from './math/vec3';
import { figureMeta, poseFigure, smithSquatFigure } from './figures';
import { SMITH_SQUAT } from './fixtures/smith-squat';
import { FIGURES, POSE_SPECS } from './fixtures';
import { barArrow } from './overlay';
import { ILLUSTRATIVE_SMITH } from './geometry/smith';
import { checkFigureFrame } from './pose/checkFigureFrame';
import { REAL_SKELETON } from './pose/realSkeleton';
import type { PoseFigureSpec } from './pose/poseSpec';
import { syntheticSkeleton } from './pose/synthetic';
import { STAND, stand } from './pose/testing/frames';

const sk = syntheticSkeleton();
const T = { en: 'Test', zh: '测试' };
const spec: PoseFigureSpec = {
  kind: 'pose',
  id: 'test-curl',
  name: T,
  scene: {},
  camera: { azimuthDeg: 30, elevationDeg: 5, distanceCm: 400, target: { bodyCm: [0, 100, 0] } },
  frames: [
    { ...STAND, id: 'a', arrow: { track: 'hand_l', toward: 1, offsetCm: [10, 0, 0] } },
    stand({ id: 'b', trunk: { hips: { bodyCm: [0, 80, 0] } } }),
    stand({ id: 'c', arrow: { track: 'hips', toward: 0 } }),
  ],
};

describe('poseFigure', () => {
  const fig = poseFigure(spec);
  it('exposes frames, default play order and camera scaled with stature', () => {
    expect(fig.frames.map((f) => f.id)).toEqual(['a', 'b', 'c']);
    expect(fig.playOrder).toEqual([0, 1, 2, 0]);
    expect(fig.camera({ statureCm: 200 }).distanceCm).toBeCloseTo((400 * 200) / 175);
    expect(fig.camera({ statureCm: 200 }).targetCm[1]).toBeCloseTo((100 * 200) / 175);
  });
  it('poses and validates keyframes and in-between poses', () => {
    expect(fig.pose(sk, 0, { statureCm: 175 }).findings).toEqual([]);
    expect(fig.pose(sk, { from: 0, to: 1, t: 0.5 }, { statureCm: 175 }).frameId).toBe('a>b@0.5');
    expect(() => fig.pose(sk, 5, { statureCm: 175 })).toThrow(RangeError);
  });
  it('draws an arrow of fixed length toward the tracked point in the target frame, and none when it does not move', () => {
    const a = fig.pose(sk, 0, { statureCm: 175 }).arrow!;
    expect(distance(a.from, a.to)).toBeCloseTo(36);
    expect(a.to[1]).toBeLessThan(a.from[1]); // frame b is lower
    expect(fig.pose(sk, 2, { statureCm: 175 }).arrow).toBeNull();
  });
  it('only poses when asked not to validate (the viewer Play)', () => {
    const drawn = fig.pose(sk, { from: 0, to: 1, t: 0.5 }, { statureCm: 175 }, { validate: false });
    const checked = fig.pose(sk, { from: 0, to: 1, t: 0.5 }, { statureCm: 175 });
    expect(drawn.local).toEqual(checked.local);
    expect([drawn.findings, drawn.arrow, Number.isNaN(drawn.topCm)]).toEqual([[], null, true]);
    // Standing frames declare no body contact, so nothing is settled: one solve, plus one for the arrow's target.
    expect([drawn.solves, fig.pose(sk, 0, { statureCm: 175 }).solves, fig.pose(sk, 1, { statureCm: 175 }).solves]).toEqual([1, 2, 1]);
  });
  it('builds the fixed scene once per set of equipment dimensions', () => {
    expect(fig.scene(sk, { statureCm: 175 })).toBe(fig.scene(sk, { statureCm: 190 }));
  });
  it('settles an in-between pose back onto the contact both frames keep', () => {
    const lying = (hipsY: number, pitchDeg: number) =>
      stand({ trunk: { hips: { bodyCm: [0, hipsY, 0] }, pitchDeg }, contacts: [{ part: 'chest', on: 'floor' }], legs: { l: { ...STAND.legs.l, contact: 'none', to: { from: 'body.hips', bodyCm: [10, 0, 80] } }, r: { ...STAND.legs.r, contact: 'none', to: { from: 'body.hips', bodyCm: [-10, 0, 80] } } } });
    const f = poseFigure({ ...spec, frames: [{ ...lying(12, -90), id: 'a', arrow: undefined }, lying(30, -120), lying(12, -90)] });
    for (const t of [0.25, 0.5, 0.75]) {
      const posed = f.pose(sk, { from: 0, to: 1, t }, { statureCm: 175 });
      expect(posed.findings.filter((x) => x.check === 'anchor')).toEqual([]);
      // Converged well before the search runs out (1 + 1 + SETTLE_STEPS + 1 = 8 solves).
      expect(posed.solves).toBeLessThanOrEqual(5);
    }
  });
});

describe('smithSquatFigure (the M1 squat, unchanged)', () => {
  const fig = FIGURES['smith-squat']!;
  it('poses exactly what checkFigureFrame does, with the M1 arrow and the bar parts at the bar', () => {
    SMITH_SQUAT.frames.forEach((frame, i) => {
      const posed = fig.pose(REAL_SKELETON, i, { statureCm: 175 });
      const { solution, findings } = checkFigureFrame(REAL_SKELETON, SMITH_SQUAT, frame, { statureCm: 175, smith: ILLUSTRATIVE_SMITH });
      expect(posed.local).toEqual(solution.local);
      expect(posed.findings).toEqual(findings);
      expect(posed.arrow).toEqual(barArrow(frame.arrow, solution.barCenter, ILLUSTRATIVE_SMITH));
      const bar = posed.props.find((p) => p.id === 'bar')!;
      expect(bar.kind === 'cylinder' && bar.start[1]).toBeCloseTo(solution.barCenter[1]);
    });
  });
  it('draws the catches below the lowest bar of the set and the camera as in M1', () => {
    const catches = fig.scene(REAL_SKELETON, { statureCm: 175 }).prims.filter((p) => p.id.startsWith('catch-'));
    expect(catches).toHaveLength(2);
    expect(fig.camera({ statureCm: 175 })).toEqual({ azimuthDeg: 35, elevationDeg: 6, distanceCm: 520, targetCm: [0, 100, 0] });
    expect(smithSquatFigure(SMITH_SQUAT).expectedFailures).toEqual([]);
  });
});

describe('the figure library', () => {
  it('gives every figure three frames and a unique id', () => {
    for (const f of Object.values(FIGURES)) expect(f.frames, f.id).toHaveLength(3);
    expect(Object.keys(FIGURES)).toHaveLength(POSE_SPECS.length + 1);
  });
  it('gives pages plain, serializable metadata', () => {
    const meta = figureMeta(FIGURES['db-curl']!);
    expect(JSON.parse(JSON.stringify(meta))).toEqual(meta);
    expect(meta.frames.map((f) => f.label.en)).toEqual(['Start', 'Top', 'Lower']);
  });
});
