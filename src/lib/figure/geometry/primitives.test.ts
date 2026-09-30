import { describe, expect, it } from 'vitest';
import { fromAxisAngle } from '../math/quat';
import { aabbOf, aabbOverlap, type Aabb, penetrationDepth, type Primitive, signedDistance } from './primitives';

const box = (center: [number, number, number], size: [number, number, number]): Primitive => ({
  kind: 'box',
  id: 'b',
  center,
  size,
  surface: 'frame',
});
const cyl = (start: [number, number, number], end: [number, number, number], radius: number): Primitive => ({
  kind: 'cylinder',
  id: 'c',
  start,
  end,
  radius,
  surface: 'chrome',
});

describe('aabbOf', () => {
  it('bounds a box by its half sizes', () => {
    const a = aabbOf(box([1, 2, 3], [2, 4, 6]));
    expect(a.min).toEqual([0, 0, 0]);
    expect(a.max).toEqual([2, 4, 6]);
  });
  it('bounds a vertical cylinder', () => {
    const a = aabbOf(cyl([0, 10, 0], [0, 50, 0], 2));
    expect(a.min).toEqual([-2, 10, -2]);
    expect(a.max).toEqual([2, 50, 2]);
  });
  it('adds no extent along the axis of an X-axis cylinder', () => {
    const a = aabbOf(cyl([-10, 5, 0], [10, 5, 0], 2));
    expect(a.min).toEqual([-10, 3, -2]);
    expect(a.max).toEqual([10, 7, 2]);
  });
  it('adds r*sqrt(1-d^2) per axis for a 45 degree cylinder in the XY plane', () => {
    const e = 2 * Math.SQRT1_2;
    const a = aabbOf(cyl([0, 0, 0], [10, 10, 0], 2));
    expect(a.min[0]).toBeCloseTo(-e);
    expect(a.min[1]).toBeCloseTo(-e);
    expect(a.min[2]).toBeCloseTo(-2);
    expect(a.max[0]).toBeCloseTo(10 + e);
    expect(a.max[1]).toBeCloseTo(10 + e);
    expect(a.max[2]).toBeCloseTo(2);
  });
});

describe('aabbOverlap', () => {
  const unit: Aabb = { min: [0, 0, 0], max: [1, 1, 1] };
  it('is true for overlapping boxes', () => {
    expect(aabbOverlap(unit, { min: [0.5, 0.5, 0.5], max: [2, 2, 2] })).toBe(true);
  });
  it('is false for separated boxes', () => {
    expect(aabbOverlap(unit, { min: [2, 0, 0], max: [3, 1, 1] })).toBe(false);
  });
  it('is false when only faces touch', () => {
    expect(aabbOverlap(unit, { min: [1, 0, 0], max: [2, 1, 1] })).toBe(false);
  });
});

describe('rotated boxes, capped spheres and distances', () => {
  const tilted: Primitive = { kind: 'box', id: 't', center: [0, 0, 0], size: [2, 2, 2], surface: 'pad', rotation: fromAxisAngle([0, 0, 1], Math.PI / 4) };
  const dome: Primitive = { kind: 'sphere', id: 'd', center: [0, 0, 0], radius: 10, surface: 'dome', capBelowY: 4 };

  it('bounds a rotated box by its corners', () => {
    const a = aabbOf(tilted);
    expect(a.max[0]).toBeCloseTo(Math.SQRT2);
    expect(a.max[2]).toBeCloseTo(1);
  });
  it('bounds a capped sphere from its cut', () => {
    expect(aabbOf(dome).min[1]).toBe(4);
    expect(aabbOf(dome).max[1]).toBe(10);
  });
  it('gives signed distances: negative inside, positive outside', () => {
    expect(signedDistance(box([0, 0, 0], [2, 2, 2]), [0, 0, 0])).toBeCloseTo(-1);
    expect(signedDistance(box([0, 0, 0], [2, 2, 2]), [3, 0, 0])).toBeCloseTo(2);
    expect(signedDistance(tilted, [Math.SQRT2 + 1, 0, 0])).toBeCloseTo(1);
    expect(signedDistance(cyl([0, 0, 0], [0, 10, 0], 2), [5, 5, 0])).toBeCloseTo(3);
    expect(signedDistance(cyl([0, 0, 0], [0, 10, 0], 2), [0, 13, 0])).toBeCloseTo(3);
    expect(signedDistance(dome, [0, 2, 0])).toBeCloseTo(2);
    expect(signedDistance(dome, [0, 12, 0])).toBeCloseTo(2);
  });
  it('measures how deep one primitive reaches into another', () => {
    expect(penetrationDepth(box([0, 0, 0], [2, 2, 2]), box([1.5, 0, 0], [2, 2, 2]))).toBeCloseTo(0.5);
    expect(penetrationDepth(box([0, 0, 0], [2, 2, 2]), box([5, 0, 0], [2, 2, 2]))).toBe(0);
  });
});
