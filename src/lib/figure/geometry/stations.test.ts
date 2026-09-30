import { describe, expect, it } from 'vitest';
import { BENCH_ANGLES_DEG, buildBench, benchProblems, ILLUSTRATIVE_BENCH } from './bench';
import { EQUIPMENT_MODELS } from './models';
import { aabbOf, type Primitive } from './primitives';
import { buildScene, ILLUSTRATIVE_SCENE, sceneParamsWith } from './scene';
import { detached, gap } from './touching';
import { buildTrainer, ILLUSTRATIVE_TRAINER, pulleyPoint, smithMovingParts, trainerProblems } from './trainer';

const ids = (prims: readonly Primitive[]) => prims.map((p) => p.id);
const unique = (prims: readonly Primitive[]) => new Set(ids(prims)).size === prims.length;
const lowest = (prims: readonly Primitive[]) => Math.min(...prims.map((p) => aabbOf(p).min[1]));

describe('trainer', () => {
  const t = buildTrainer(ILLUSTRATIVE_TRAINER, { barHeightCm: 120, catchHeightCm: 80, holdDown: true, footplate: true, jHookHeightCm: 130, spotterArmHeightCm: 70 });
  it('mounts the spotter arms on the uprights, clear of the Smith rails and carriage', () => {
    for (const side of ['left', 'right'] as const) {
      const find = (id: string) => t.prims.find((p) => p.id === id)!;
      const arm = find(`spotter-${side}`);
      for (const end of ['front', 'back']) {
        const sleeve = find(`spotter-sleeve-${side}-${end}`);
        expect(gap(arm, sleeve)).toBeLessThanOrEqual(0);
        expect(gap(sleeve, find(`upright-${end}-${side}`))).toBeLessThanOrEqual(0);
      }
      expect(gap(arm, find(`rail-${side}`))).toBeGreaterThan(0.5);
    }
  });
  it('has unique ids and stands on the floor', () => {
    expect(unique(t.prims)).toBe(true);
    expect(lowest(t.prims)).toBeGreaterThanOrEqual(0);
  });
  it('puts the pull-up bar at its height, in front of the rack', () => {
    const bar = t.anchors['pullup.bar']!;
    expect(bar[1] + ILLUSTRATIVE_TRAINER.pullUpBarRadiusCm).toBeCloseTo(ILLUSTRATIVE_TRAINER.pullUpBarHeightCm);
    expect(bar[2]).toBeGreaterThan(ILLUSTRATIVE_TRAINER.rackInnerDepthCm / 2);
  });
  it('names a pulley for each column and setting, rising from low to high', () => {
    for (const side of ['left', 'right'] as const) {
      const [low, chest, high] = (['low', 'chest', 'high'] as const).map((h) => t.anchors[`cable.${side}.${h}`]![1]);
      expect(low!).toBeLessThan(chest!);
      expect(chest!).toBeLessThan(high!);
      expect(t.anchors[`cable.${side}.chest`]).toEqual(pulleyPoint(ILLUSTRATIVE_TRAINER, side, 'chest'));
    }
  });
  it('gives the hold-down and the footplate surfaces to rest on', () => {
    expect(t.surfaces['hold-down.pad']).toMatchObject({ kind: 'plane', normal: [0, 1, 0], primitive: 'hold-down-pad' });
    expect(t.anchors['hold-down.pad']![1]).toBe(ILLUSTRATIVE_TRAINER.holdDownPadTopCm);
    expect(t.surfaces.footplate?.kind).toBe('plane');
  });
  it('leaves the Smith bar out unless a bar height is given; the moving parts follow it', () => {
    const still = buildTrainer(ILLUSTRATIVE_TRAINER);
    expect(ids(still.prims)).not.toContain('bar');
    expect(ids(smithMovingParts(ILLUSTRATIVE_TRAINER, 100)).sort()).toEqual(['bar', 'carriage-left', 'carriage-right', 'plate-left', 'plate-right']);
  });
  it('reports impossible settings', () => {
    expect(trainerProblems({ ...ILLUSTRATIVE_TRAINER, pulleyHeightsCm: { low: 150, chest: 120, high: 195 } })).toContain('pulley heights must rise from low to chest to high');
    expect(() => buildTrainer({ ...ILLUSTRATIVE_TRAINER, pullUpBarHeightCm: 60 })).toThrow(/pull-up bar at 60 cm/);
  });
});

describe('trainer connectivity', () => {
  const options = [
    ['bare', {}],
    ['with bar, catches, J-hooks and spotter arms', { barHeightCm: 120, catchHeightCm: 80, jHookHeightCm: 130, spotterArmHeightCm: 70 }],
    ['with the hold-down', { holdDown: true }],
    ['with the footplate', { footplate: true }],
    ['with everything and raised pulleys', { barHeightCm: 140, catchHeightCm: 70, pulleys: { left: 'chest', right: 'high' }, jHookHeightCm: 135, spotterArmHeightCm: 70, holdDown: true, footplate: true }],
  ] as const;
  it.each(options)('is one connected piece %s', (_n, state) => {
    expect(detached(buildTrainer(ILLUSTRATIVE_TRAINER, state).prims)).toEqual([]);
  });
});

describe('bench', () => {
  it('puts the seat at its height and raises the backrest with the angle', () => {
    const flat = buildBench(ILLUSTRATIVE_BENCH, 0);
    const upright = buildBench(ILLUSTRATIVE_BENCH, 90);
    expect(flat.anchors['bench.seat']![1]).toBe(ILLUSTRATIVE_BENCH.seatHeightCm);
    expect(flat.anchors['bench.head']![1]).toBeCloseTo(ILLUSTRATIVE_BENCH.seatHeightCm);
    expect(upright.anchors['bench.head']![1]).toBeCloseTo(ILLUSTRATIVE_BENCH.seatHeightCm + ILLUSTRATIVE_BENCH.backrestLengthCm);
    const back = upright.surfaces['bench.back']!;
    expect(back.kind === 'plane' && back.normal[2]).toBeCloseTo(1);
    expect(unique(flat.prims) && lowest(flat.prims) >= 0).toBe(true);
  });
  it('only locks at the listed angles', () => {
    expect(benchProblems(ILLUSTRATIVE_BENCH, 20)).toEqual(['backrest angle 20° is not one the bench locks at (0, 15, 30, 45, 60, 75, 90)']);
    expect(() => buildBench(ILLUSTRATIVE_BENCH, 20)).toThrow(/20°/);
  });
});

describe('bench connectivity', () => {
  it.each(BENCH_ANGLES_DEG)('is one connected piece with the backrest at %s°', (angle) => {
    expect(detached(buildBench(ILLUSTRATIVE_BENCH, angle).prims)).toEqual([]);
  });
});

describe('the model registry', () => {
  it('has a model for every v1 equipment class and attachment (spec §5.1, §5.2)', () => {
    const equipment = ['smith-functional-trainer', 'adjustable-bench', 'dumbbells', 'barbell', 'resistance-bands', 'treadmill', 'rowing-machine', 'exercise-bike', 'foam-roller', 'massage-ball', 'ab-wheel', 'exercise-ball', 'balance-trainer'];
    const attachments = ['rope', 'close-grip-row-handle', 'single-handle', 'lat-bar', 'ankle-strap', 'row-footplate', 'roller-hold-down'];
    expect(Object.values(EQUIPMENT_MODELS).filter((m) => m.kind === 'equipment').map((m) => m.id).sort()).toEqual([...equipment].sort());
    expect(Object.values(EQUIPMENT_MODELS).filter((m) => m.kind === 'attachment').map((m) => m.id).sort()).toEqual([...attachments].sort());
  });
  it.each(Object.keys(EQUIPMENT_MODELS))('%s builds with unique ids and a view that frames it', (id) => {
    const m = EQUIPMENT_MODELS[id]!;
    const b = m.build();
    expect(b.prims.length).toBeGreaterThan(0);
    expect(unique(b.prims)).toBe(true);
    expect(m.view.distanceCm).toBeGreaterThan(20);
  });
});

describe('model connectivity', () => {
  // Two dumbbells are separate objects by design, and a band is drawn as two thin strands half a centimetre apart; every other model is one piece.
  const single = Object.keys(EQUIPMENT_MODELS).filter((id) => id !== 'dumbbells' && id !== 'resistance-bands');
  it.each(single)('%s is one connected piece', (id) => {
    expect(detached(EQUIPMENT_MODELS[id]!.build().prims)).toEqual([]);
  });
});

describe('buildScene', () => {
  it('always has the floor, and places the bench and floor items', () => {
    const s = buildScene({ bench: { at: [0, 0, 50], angleDeg: 30 }, items: [{ model: 'exercise-ball', at: [100, 0, 0] }] });
    expect(s.surfaces.floor).toMatchObject({ kind: 'plane', normal: [0, 1, 0] });
    expect(s.anchors['bench.hinge']![2]).toBe(50);
    expect(s.anchors['exercise-ball.top']).toEqual([100, 65, 0]);
  });
  it('draws with illustrative dimensions unless some are replaced', () => {
    expect(sceneParamsWith().trainer).toEqual(ILLUSTRATIVE_SCENE.trainer);
    const s = buildScene({ trainer: {} }, sceneParamsWith({ trainer: { pullUpBarHeightCm: 205 } }));
    expect(s.anchors['pullup.bar']![1] + ILLUSTRATIVE_TRAINER.pullUpBarRadiusCm).toBeCloseTo(205);
  });
});
