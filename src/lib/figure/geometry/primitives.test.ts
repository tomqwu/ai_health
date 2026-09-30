import { describe, expect, it } from 'vitest';
import { aabbOf, aabbOverlap, type Aabb, type Primitive } from './primitives';

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
