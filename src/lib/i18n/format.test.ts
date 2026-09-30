import { describe, expect, it } from 'vitest';
import { en } from './en';
import { zh } from './zh';
import { formatLength, formatLoad, formatMass, formatMessage, placeholders } from './format';

const squat = { en: 'Smith Machine Squat', zh: '史密斯机深蹲' };
const bench = { en: 'Adjustable bench', zh: '可调训练凳' };

describe('dictionary placeholders', () => {
  it('match between en and zh for every key', () => {
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(placeholders(zh[key]), key).toEqual(placeholders(en[key]));
    }
  });
});

describe('formatMessage', () => {
  it('fills I18nText params in the current language', () => {
    const msg = { key: 'engine.notice.overrideDropped', params: { exercise: squat } } as const;
    expect(formatMessage('en', msg)).toContain('Smith Machine Squat');
    expect(formatMessage('zh', msg)).toContain('史密斯机深蹲');
  });
  it('joins lists with the language separator', () => {
    const msg = { key: 'engine.reason.missingCapability', params: { equipment: [squat, bench] } } as const;
    expect(formatMessage('en', msg)).toContain('Smith Machine Squat, Adjustable bench');
    expect(formatMessage('zh', msg)).toContain('史密斯机深蹲、可调训练凳');
  });
  it('shows lengths in the requested unit', () => {
    const msg = {
      key: 'engine.reason.ceiling',
      params: { need: { lengthCm: 240 }, margin: { lengthCm: 10 }, ceiling: { lengthCm: 230 } },
    } as const;
    expect(formatMessage('en', msg)).toContain('240 cm');
    expect(formatMessage('en', msg, { length: 'in' })).toContain('94.5 in');
    expect(formatMessage('zh', msg)).toContain('240 厘米');
  });
  it('formats the clearance note for an assumed ceiling (D12)', () => {
    const msg = {
      key: 'engine.note.checkClearance',
      params: { need: { lengthCm: 243 }, margin: { lengthCm: 10 }, ceiling: { lengthCm: 240 } },
    } as const;
    expect(formatMessage('en', msg)).toContain('about 243 cm of height');
    expect(formatMessage('en', msg, { length: 'in' })).toContain('so 94.5 in was assumed');
    expect(formatMessage('zh', msg)).toContain('按 240 厘米 估算');
  });
  it('looks up nested dictionary keys', () => {
    const msg = { key: 'engine.why.easyOnJoint', params: { joint: { key: 'joint.knee' } } } as const;
    expect(formatMessage('en', msg)).toBe('Easy on the knee');
    expect(formatMessage('zh', msg)).toBe('对膝关节负担小');
  });
  it('throws when a param is missing', () => {
    expect(() => formatMessage('en', { key: 'engine.why.easyOnJoint' })).toThrow('needs param "joint"');
  });
});

describe('unit formatting', () => {
  it('formats lengths, masses and printed loads', () => {
    expect(formatLength('en', 175, 'cm')).toBe('175 cm');
    expect(formatLength('zh', 175, 'in')).toBe('68.9 英寸');
    expect(formatMass('en', 20, 'lb')).toBe('44.1 lb');
    expect(formatLoad('zh', 25, 'lb')).toBe('25 磅');
    expect(formatLoad('en', 12.5, 'kg')).toBe('12.5 kg');
  });
});
