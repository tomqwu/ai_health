import { describe, expect, it } from 'vitest';
import { compareIds } from './order';

describe('compareIds', () => {
  it('orders by code unit, whatever the runtime locale', () => {
    // Czech collation sorts "ch" after "h"; code-unit order puts it before.
    expect(['h-row', 'ch-press'].sort(compareIds)).toEqual(['ch-press', 'h-row']);
    expect('ch-press'.localeCompare('h-row', 'cs')).toBeGreaterThan(0); // the hazard this guards against
    expect(compareIds('a', 'a')).toBe(0);
    expect(compareIds('b', 'a')).toBeGreaterThan(0);
  });
});
