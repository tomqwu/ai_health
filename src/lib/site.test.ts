import { describe, expect, it } from 'vitest';
import { withBase } from './site';

describe('withBase', () => {
  it('joins the base and a relative path with one slash', () => {
    expect(withBase('en/', '/ai_health/')).toBe('/ai_health/en/');
    expect(withBase('/models/human.glb', '/ai_health')).toBe('/ai_health/models/human.glb');
  });
  it('returns the base for an empty path', () => {
    expect(withBase('', '/ai_health/')).toBe('/ai_health/');
    expect(withBase('', '/')).toBe('/');
  });
});
