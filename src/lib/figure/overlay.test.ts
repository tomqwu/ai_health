import { describe, expect, it } from 'vitest';
import { ILLUSTRATIVE_SMITH } from './geometry/smith';
import { arrowPaths, arrowSvg } from './arrow';
import { barArrow } from './overlay';

describe('barArrow', () => {
  it('returns null without a direction', () => {
    expect(barArrow(undefined, [0, 120, 0], ILLUSTRATIVE_SMITH)).toBeNull();
  });
  it('points down for "down", outside the plates', () => {
    const a = barArrow('down', [0, 120, 0], ILLUSTRATIVE_SMITH)!;
    expect(a.to[1]).toBeLessThan(a.from[1]);
    expect(a.from[0]).toBeGreaterThan(ILLUSTRATIVE_SMITH.railHalfSpacingCm + ILLUSTRATIVE_SMITH.sleeveLengthCm);
  });
  it('points up for "up"', () => {
    const a = barArrow('up', [0, 120, 0], ILLUSTRATIVE_SMITH)!;
    expect(a.to[1]).toBeGreaterThan(a.from[1]);
  });
});

describe('arrowPaths', () => {
  it('stops the line at the head base and puts the tip on the target', () => {
    const p = arrowPaths([10, 10], [10, 110], 18);
    expect(p.line).toBe('M10.0 10.0 L10.0 92.0');
    expect(p.head).toBe('M10.0 110.0 L0.1 92.0 L19.9 92.0 Z');
  });
  it('rejects zero-length arrows', () => {
    expect(() => arrowPaths([5, 5], [5, 5])).toThrow(/zero-length/);
  });
  it('wraps the paths in a sized SVG', () => {
    expect(arrowSvg(900, 1200, [10, 10], [10, 110])).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="900" height="1200">/);
  });
});
