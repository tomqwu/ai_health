import { describe, expect, it } from 'vitest';
import { defaultProfile, ProfileSchema } from './schema';

const valid = () => ({
  ...defaultProfile('en'),
  statureCm: 172,
  room: { ceilingHeightCm: 243.84, clearanceMarginCm: 10 }, // a standard 8 ft ceiling
  equipment: [
    {
      id: 'smith-functional-trainer',
      params: {
        smithLowestBarHeightCm: 45,
        pulleyPositions: ['high', 'low'],
        cableStack: { first: 5, last: 80, step: 5, unit: 'kg' },
        benchFitsInsideRack: true,
      },
    },
  ],
  attachments: ['rope'],
  limitations: ['wrist-sensitive'],
  schedule: { templateId: 'split-6day-push-legs-core-pull-full-mobility', sessionMinutes: 30, overrides: { 'mon/0': 'smith-squat' } },
});

describe('ProfileSchema', () => {
  it('accepts the default profile in both locales', () => {
    expect(ProfileSchema.parse(defaultProfile('en')).locale).toBe('en');
    expect(ProfileSchema.parse(defaultProfile('zh')).locale).toBe('zh');
  });
  it('accepts a filled-in synthetic profile', () => {
    expect(ProfileSchema.parse(valid()).equipment[0]!.params.smithLowestBarHeightCm).toBe(45);
  });
  it('defaults the clearance margin to 10 cm', () => {
    const p = ProfileSchema.parse({ ...valid(), room: {} });
    expect(p.room.clearanceMarginCm).toBe(10);
  });
  it('rejects fields the site never collects', () => {
    expect(ProfileSchema.safeParse({ ...valid(), name: 'A' }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...valid(), age: 40 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...valid(), room: { clearanceMarginCm: 10, notes: 'x' } }).success).toBe(false);
  });
  it('rejects bad override keys, duplicate equipment and unknown limitations', () => {
    const v = valid();
    expect(ProfileSchema.safeParse({ ...v, schedule: { ...v.schedule, overrides: { monday: 'smith-squat' } } }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...v, equipment: [...v.equipment, ...v.equipment] }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...v, limitations: ['hip-sensitive'] }).success).toBe(false);
  });
  it('rejects an attachment, exclusion or limitation listed twice', () => {
    const v = valid();
    expect(ProfileSchema.safeParse({ ...v, attachments: ['rope', 'lat-bar', 'rope'] }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...v, exclusions: ['smith-squat', 'smith-squat'] }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...v, limitations: ['knee-sensitive', 'knee-sensitive'] }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...v, attachments: ['rope', 'lat-bar'], exclusions: ['smith-squat'], limitations: ['knee-sensitive', 'wrist-sensitive'] }).success).toBe(true);
  });
  it('rejects an out-of-range stature and a wrong version', () => {
    expect(ProfileSchema.safeParse({ ...valid(), statureCm: 20 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...valid(), version: 2 }).success).toBe(false);
  });
});
