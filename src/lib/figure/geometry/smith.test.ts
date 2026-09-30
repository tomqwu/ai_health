import { describe, expect, it } from 'vitest';
import { aabbOf, aabbOverlap, type Primitive } from './primitives';
import { buildSmith, catchHeightFor, ILLUSTRATIVE_SMITH as P, type SmithParams, smithProblems } from './smith';

const CARRIAGE_HALF_HEIGHT_CM = P.carriageHeightCm / 2;

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

  it('draws the parts from named params, with the previous drawing as the defaults', () => {
    const size = (id: string) => {
      const p = byId(prims, id);
      if (p.kind !== 'box') throw new Error(`${id} must be a box`);
      return p.size;
    };
    expect(size('carriage-left')).toEqual([P.carriageWidthCm, P.carriageHeightCm, P.carriageWidthCm]);
    expect(size('stop-left')).toEqual([P.stopBlockWidthCm, P.stopBlockHeightCm, P.stopBlockWidthCm]);
    expect(size('catch-left')).toEqual([P.catchBlockWidthCm, P.catchBlockHeightCm, P.catchBlockWidthCm]);
    // The values the drawing used before they became params (so the render does not change).
    expect([P.carriageWidthCm, P.carriageHeightCm, P.stopBlockWidthCm, P.stopBlockHeightCm]).toEqual([6, 16, 7, 4]);
    expect([P.catchBlockWidthCm, P.catchBlockHeightCm, P.plateGapCm, P.railBottomCm, P.catchBelowBottomCm]).toEqual([9, 3, 8, 3, 8]);
    expect(aabbOf(byId(prims, 'plate-left')).min[0]).toBeCloseTo(P.railHalfSpacingCm + P.plateGapCm);
    const rail = byId(prims, 'rail-left');
    expect(rail.kind === 'cylinder' && rail.start[1]).toBe(P.railBottomCm);
  });
  it('follows changed part params', () => {
    const q: SmithParams = { ...P, carriageHeightCm: 20, stopBlockHeightCm: 6, catchBlockHeightCm: 5, plateGapCm: 10 };
    const built = buildSmith(q, { barHeightCm: 120, catchHeightCm: 90 });
    expect(aabbOf(byId(built, 'carriage-left')).max[1]).toBeCloseTo(130);
    expect(aabbOf(byId(built, 'stop-left')).max[1]).toBeCloseTo(q.lowestBarHeightCm - 10);
    expect(aabbOf(byId(built, 'stop-left')).min[1]).toBeCloseTo(q.lowestBarHeightCm - 16);
    expect(aabbOf(byId(built, 'catch-left')).max[1]).toBeCloseTo(80);
    expect(aabbOf(byId(built, 'catch-left')).min[1]).toBeCloseTo(75);
    expect(aabbOf(byId(built, 'plate-left')).min[0]).toBeCloseTo(q.railHalfSpacingCm + 10);
  });
});

describe('smithProblems', () => {
  it('accepts the illustrative machine at every bar and catch height in range', () => {
    expect(smithProblems(P)).toEqual([]);
    for (const h of [P.lowestBarHeightCm, 100, P.highestBarHeightCm]) {
      expect(smithProblems(P, { barHeightCm: h, catchHeightCm: h })).toEqual([]);
    }
  });
  it.each<[string, Partial<SmithParams>, RegExp]>([
    ['lowest bar not below the highest', { lowestBarHeightCm: 180 }, /lowest bar height .* below the highest/],
    ['non-finite value', { rackHeightCm: Number.NaN }, /rackHeightCm/],
    ['non-positive size', { carriageWidthCm: 0 }, /carriageWidthCm/],
    ['rails outside the rack', { railHalfSpacingCm: 61 }, /rails .* inside the rack/],
    ['plates longer than the sleeve', { plateGapCm: 26 }, /plates .* sleeve/],
    ['plates hitting the front and back uprights', { plateDiameterCm: 101 }, /plates .* depth/],
    ['plates hitting the floor frame at the lowest bar', { lowestBarHeightCm: 24 }, /plates .* floor/],
    ['plates hitting the top frame at the highest bar', { highestBarHeightCm: 190 }, /plates .* top/],
    ['stop blocks below the rail foot', { lowestBarHeightCm: 14 }, /stop .* rail/],
    ['blocks narrower than the rail', { stopBlockWidthCm: 2 }, /stopBlockWidthCm .* rail/],
  ])('rejects %s', (_, change, message) => {
    const problems = smithProblems({ ...P, ...change });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toMatch(message);
  });
  it('rejects a bar or catch height outside the travel, and a catch below the lowest bar', () => {
    expect(smithProblems(P, { barHeightCm: P.highestBarHeightCm + 1 }).join()).toMatch(/bar height 181 .* 40–180/);
    expect(smithProblems(P, { barHeightCm: P.lowestBarHeightCm - 1 }).join()).toMatch(/bar height 39 .* 40–180/);
    expect(smithProblems(P, { barHeightCm: 100, catchHeightCm: P.lowestBarHeightCm - 1 }).join()).toMatch(/catch height 39 .* lowest bar height 40/);
    expect(smithProblems(P, { barHeightCm: 100, catchHeightCm: P.highestBarHeightCm + 1 }).join()).toMatch(/catch height 181/);
  });
  it('buildSmith refuses invalid params or state', () => {
    expect(() => buildSmith(P, { barHeightCm: 100, catchHeightCm: 20 })).toThrow(/buildSmith: .*catch height 20/);
    expect(() => buildSmith({ ...P, lowestBarHeightCm: 200 }, { barHeightCm: 100 })).toThrow(/buildSmith: /);
  });
  it('catchHeightFor sets the catches below the lowest rep, never below the lowest bar height', () => {
    expect(catchHeightFor(P, 100)).toBe(100 - P.catchBelowBottomCm);
    expect(catchHeightFor(P, P.lowestBarHeightCm + 2)).toBe(P.lowestBarHeightCm);
  });
});
