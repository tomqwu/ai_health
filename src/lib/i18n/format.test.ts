import { describe, expect, it } from 'vitest';
import { en, type MessageKey } from './en';
import { zh } from './zh';
import { formatLength, formatLoad, formatMass, formatMessage, type Message, placeholders } from './format';

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

type EngineOrProfileKey = Extract<MessageKey, `engine.${string}` | `profile.${string}`>;

/**
 * Representative params for every engine and profile message, shaped as the code emits them. Typed as a
 * complete map, so a new key without an entry fails the type check.
 */
const SAMPLE_PARAMS: { [K in EngineOrProfileKey]: Message['params'] } = {
  'engine.reason.missingCapability': { equipment: [squat, bench] },
  'engine.reason.missingAttachment': { attachment: { en: 'Rope', zh: '绳索' } },
  'engine.reason.attachmentNoFit': { attachment: { en: 'Rope', zh: '绳索' } },
  'engine.reason.excluded': undefined,
  'engine.reason.ceiling': { need: { lengthCm: 244 }, margin: { lengthCm: 10 }, ceiling: { lengthCm: 243 } },
  'engine.reason.barBelowStop': { height: { lengthCm: 44 }, stop: { lengthCm: 45 } },
  'engine.reason.barAboveStop': { height: { lengthCm: 186 }, stop: { lengthCm: 185 } },
  'engine.reason.benchFit': undefined,
  'engine.reason.benchFitUnknown': undefined,
  'engine.reason.stopsUnknown': undefined,
  'engine.reason.rom': undefined,
  'engine.reason.noGeometryModel': undefined,
  'engine.reason.poseFailed': undefined,
  'engine.why.fits': undefined,
  'engine.why.override': undefined,
  'engine.why.sameStation': undefined,
  'engine.why.easyOnJoint': { joint: { key: 'joint.knee' } },
  'engine.why.hardOnJoint': { joint: { key: 'joint.lowBack' } },
  'engine.why.usedEarlier': undefined,
  'engine.notice.overrideDropped': { exercise: squat },
  'engine.notice.overrideInvalid': undefined,
  'engine.empty.noExercise': undefined,
  'engine.empty.noneFeasible': undefined,
  'engine.note.jointModerate': { joint: { key: 'joint.shoulder' } },
  'engine.note.jointHigh': { joint: { key: 'joint.wrist' } },
  'engine.note.checkClearance': { need: { lengthCm: 243 }, margin: { lengthCm: 10 }, ceiling: { lengthCm: 240 } },
  'engine.assumed.stature': { height: { lengthCm: 175 } },
  'engine.assumed.ceiling': { ceiling: { lengthCm: 240 } },
  'profile.error.notJson': undefined,
  'profile.error.notProfile': undefined,
  'profile.error.newerVersion': { version: 2 },
  'profile.error.required': undefined,
  'profile.error.type': undefined,
  'profile.error.range': undefined,
  'profile.error.choice': undefined,
  'profile.error.unknownField': { field: 'name, age' },
  'profile.error.duplicate': undefined,
  'profile.error.invalid': undefined,
};

describe('every engine and profile message', () => {
  const keys = (Object.keys(en) as MessageKey[]).filter((k): k is EngineOrProfileKey => /^(engine|profile)\./.test(k));

  it('has representative params that name exactly its placeholders', () => {
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(Object.keys(SAMPLE_PARAMS[key] ?? {}).sort(), key).toEqual(placeholders(en[key]));
    }
  });
  it('formats in both languages and both length units, with no placeholder left', () => {
    for (const key of keys) {
      for (const locale of ['en', 'zh'] as const) {
        for (const length of ['cm', 'in'] as const) {
          const text = formatMessage(locale, { key, params: SAMPLE_PARAMS[key] }, { length });
          expect(text, `${locale} ${key}`).not.toMatch(/[{}]/);
          expect(text.trim(), `${locale} ${key}`).not.toBe('');
        }
      }
    }
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
