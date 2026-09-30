import { describe, expect, it } from 'vitest';
import { aabbOf, aabbOverlap, type Primitive } from './primitives';
import { buildSmith, CARRIAGE_HALF_HEIGHT_CM, ILLUSTRATIVE_SMITH as P } from './smith';

const byId = (prims: Primitive[], id: string) => {
  const p = prims.find((x) => x.id === id);
  if (!p) throw new Error(`missing ${id}`);
  return p;
};

describe('buildSmith', () => {
  const prims = buildSmith(P, { barHeightCm: 120, catchHeightCm: 90 });

  it('has unique ids', () => {
    expect(new Set(prims.map((p) => p.id)).size).toBe(prims.length);
  });
  it('places vertical rails inside the uprights', () => {
    for (const side of ['left', 'right']) {
      const rail = byId(prims, `rail-${side}`);
      if (rail.kind !== 'cylinder') throw new Error('rail must be a cylinder');
      expect(rail.start[0]).toBe(rail.end[0]);
      expect(rail.start[2]).toBe(rail.end[2]);
      expect(Math.abs(rail.start[0])).toBeLessThan(P.rackInnerWidthCm / 2);
    }
  });
  it('puts the bar, carriages and plates at the bar height', () => {
    for (const id of ['bar', 'plate-left', 'plate-right']) {
      const p = byId(prims, id);
      if (p.kind !== 'cylinder') throw new Error(`${id} must be a cylinder`);
      expect(p.start[1]).toBe(120);
    }
    const c = byId(prims, 'carriage-left');
    expect(c.kind === 'box' && c.center[1]).toBe(120);
  });
  it('loads plates outside the rails', () => {
    const plate = aabbOf(byId(prims, 'plate-left'));
    expect(plate.min[0]).toBeGreaterThan(P.railHalfSpacingCm);
  });
  it('stops the carriage at the lowest bar height', () => {
    const stop = aabbOf(byId(prims, 'stop-left'));
    expect(stop.max[1]).toBeCloseTo(P.lowestBarHeightCm - CARRIAGE_HALF_HEIGHT_CM);
  });
  it('sets catches so the carriage rests on them at the catch height', () => {
    const c = aabbOf(byId(prims, 'catch-left'));
    expect(c.max[1]).toBeCloseTo(90 - CARRIAGE_HALF_HEIGHT_CM);
  });
  it('omits catches when no catch height is given', () => {
    expect(buildSmith(P, { barHeightCm: 120 }).some((p) => p.id.startsWith('catch-'))).toBe(false);
  });
  it('keeps the bar clear of the uprights', () => {
    const bar = aabbOf(byId(prims, 'bar'));
    for (const up of prims.filter((p) => p.id.startsWith('upright-'))) {
      expect(aabbOverlap(bar, aabbOf(up)), up.id).toBe(false);
    }
  });
});
