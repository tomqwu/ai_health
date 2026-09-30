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
  it('mirrors the right-side carriage, stops and catches', () => {
    const c = byId(prims, 'carriage-right');
    expect(c.kind === 'box' && c.center[1]).toBe(120);
    expect(aabbOf(byId(prims, 'stop-right')).max[1]).toBeCloseTo(P.lowestBarHeightCm - CARRIAGE_HALF_HEIGHT_CM);
    expect(aabbOf(byId(prims, 'catch-right')).max[1]).toBeCloseTo(90 - CARRIAGE_HALF_HEIGHT_CM);
  });
  it('moves the carriage and plates with the bar height but leaves the stops alone', () => {
    const a = buildSmith(P, { barHeightCm: 100, catchHeightCm: 90 });
    const b = buildSmith(P, { barHeightCm: 150, catchHeightCm: 90 });
    for (const id of ['carriage-left', 'carriage-right', 'plate-left', 'plate-right', 'bar']) {
      expect(aabbOf(byId(b, id)).min[1] - aabbOf(byId(a, id)).min[1], id).toBeCloseTo(50);
    }
    for (const id of ['stop-left', 'stop-right', 'catch-left', 'catch-right']) {
      expect(byId(b, id), id).toEqual(byId(a, id));
    }
  });
  it('keeps the bar and plates clear of the frame at the lowest and highest bar heights', () => {
    for (const barHeightCm of [P.lowestBarHeightCm, P.highestBarHeightCm]) {
      const built = buildSmith(P, { barHeightCm });
      const frame = built.filter((p) => /^(beam|upright|base)-/.test(p.id));
      for (const id of ['bar', 'plate-left', 'plate-right']) {
        const box = aabbOf(byId(built, id));
        for (const f of frame) {
          expect(aabbOverlap(box, aabbOf(f)), `${id} vs ${f.id} at ${barHeightCm}`).toBe(false);
        }
      }
    }
  });
});
