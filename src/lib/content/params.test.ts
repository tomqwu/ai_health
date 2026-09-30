import { describe, expect, it } from 'vitest';
import { I18nTextSchema, IdSchema, ParamNameSchema } from './common';
import { type ParamDef, ParamDefSchema, paramValueMatches } from './params';

const text = { en: 'Measure it', zh: '测量它' };
const def = (d: Record<string, unknown>): ParamDef => ParamDefSchema.parse({ label: text, how: text, ...d });

describe('common schemas', () => {
  it('accepts kebab-case ids only', () => {
    expect(IdSchema.safeParse('smith-functional-trainer').success).toBe(true);
    for (const bad of ['Smith', 'smith_bar', '-smith', 'smith-', '']) expect(IdSchema.safeParse(bad).success, bad).toBe(false);
  });
  it('accepts camelCase parameter names only', () => {
    expect(ParamNameSchema.safeParse('smithLowestBarHeightCm').success).toBe(true);
    expect(ParamNameSchema.safeParse('smith-lowest').success).toBe(false);
  });
  it('requires both languages, and Chinese characters in zh', () => {
    expect(I18nTextSchema.safeParse(text).success).toBe(true);
    expect(I18nTextSchema.safeParse({ en: 'Only English' }).success).toBe(false);
    expect(I18nTextSchema.safeParse({ en: 'Squat', zh: '  ' }).success).toBe(false);
    expect(I18nTextSchema.safeParse({ en: 'Squat', zh: 'Squat' }).success).toBe(false);
  });
});

describe('ParamDefSchema', () => {
  it('requires values for enum types', () => {
    expect(ParamDefSchema.safeParse({ type: 'enum', label: text, how: text }).success).toBe(false);
    expect(def({ type: 'enum', values: ['1:1', 'unknown'] }).type).toBe('enum');
  });
  it('rejects unknown types and unknown keys', () => {
    expect(ParamDefSchema.safeParse({ type: 'inch', label: text, how: text }).success).toBe(false);
    expect(ParamDefSchema.safeParse({ type: 'cm', label: text, how: text, unit: 'cm' }).success).toBe(false);
  });
  it('has no hole types and no optional flag (D12: no hole numbers, nothing required)', () => {
    expect(ParamDefSchema.safeParse({ type: 'holes', label: text, how: text }).success).toBe(false);
    expect(ParamDefSchema.safeParse({ type: 'holes-range', label: text, how: text }).success).toBe(false);
    expect(ParamDefSchema.safeParse({ type: 'cm', label: text, how: text, optional: true }).success).toBe(false);
  });
});

describe('paramValueMatches', () => {
  it('checks scalar types', () => {
    expect(paramValueMatches(def({ type: 'cm' }), 42.5)).toBe(true);
    expect(paramValueMatches(def({ type: 'cm' }), -1)).toBe(false);
    expect(paramValueMatches(def({ type: 'cm' }), '42')).toBe(false);
    expect(paramValueMatches(def({ type: 'deg' }), 5)).toBe(true);
    expect(paramValueMatches(def({ type: 'deg' }), 120)).toBe(false);
    expect(paramValueMatches(def({ type: 'bool' }), false)).toBe(true);
    expect(paramValueMatches(def({ type: 'count' }), 2)).toBe(true);
    expect(paramValueMatches(def({ type: 'count' }), 1.5)).toBe(false);
  });
  it('checks enum and enum-set membership', () => {
    const e = def({ type: 'enum', values: ['1:1', '2:1', 'unknown'] });
    expect(paramValueMatches(e, '2:1')).toBe(true);
    expect(paramValueMatches(e, '3:1')).toBe(false);
    const s = def({ type: 'enum-set', values: ['high', 'chest', 'low'] });
    expect(paramValueMatches(s, ['high', 'low'])).toBe(true);
    expect(paramValueMatches(s, ['high', 'high'])).toBe(false);
    expect(paramValueMatches(s, ['middle'])).toBe(false);
  });
  it('checks stacks and weights', () => {
    const stack = def({ type: 'stack' });
    expect(paramValueMatches(stack, { first: 5, last: 80, step: 5, unit: 'kg' })).toBe(true);
    expect(paramValueMatches(stack, { first: 80, last: 5, step: 5, unit: 'kg' })).toBe(false);
    expect(paramValueMatches(stack, { first: 5, last: 80, step: 5, unit: 'stone' })).toBe(false);
    const w = def({ type: 'weights' });
    expect(paramValueMatches(w, { unit: 'kg', loads: [2, 4, 6, 8] })).toBe(true);
    expect(paramValueMatches(w, { unit: 'kg', loads: [4, 2] })).toBe(false);
    expect(paramValueMatches(w, { unit: 'kg', loads: [] })).toBe(false);
  });
});
