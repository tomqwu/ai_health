import { describe, expect, it } from 'vitest';
import { en } from './en';
import { zh } from './zh';
import { localeStaticPaths, localizedPath, pickLocale, requireLocale, switchLocale, t } from './index';

const CJK = /[㐀-鿿]/;

describe('dictionaries', () => {
  it('have identical keys', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });
  it('have no empty strings', () => {
    for (const d of [en, zh]) for (const [k, v] of Object.entries(d)) expect(v.trim(), k).not.toBe('');
  });
  it('have Chinese text in every zh entry', () => {
    for (const [k, v] of Object.entries(zh)) expect(CJK.test(v), `zh.${k} = "${v}"`).toBe(true);
  });
  it('t() looks up by locale', () => {
    expect(t('en', 'nav.home')).toBe('Home');
    expect(t('zh', 'nav.home')).toBe('首页');
  });
});

describe('requireLocale', () => {
  it('returns a supported locale', () => {
    expect(requireLocale('en')).toBe('en');
    expect(requireLocale('zh')).toBe('zh');
  });
  it('throws "Unknown locale: <value>" otherwise', () => {
    expect(() => requireLocale('fr')).toThrow('Unknown locale: fr');
    expect(() => requireLocale(undefined)).toThrow('Unknown locale: undefined');
    expect(() => requireLocale(42)).toThrow('Unknown locale: 42');
  });
});

describe('pickLocale', () => {
  it('matches the first supported language', () => {
    expect(pickLocale(['zh-CN', 'en'])).toBe('zh');
    expect(pickLocale(['EN-us'])).toBe('en');
  });
  it('falls back to English', () => {
    expect(pickLocale(['fr-FR'])).toBe('en');
    expect(pickLocale([])).toBe('en');
  });
});

describe('paths', () => {
  it('localizedPath builds prefixed paths with a trailing slash', () => {
    expect(localizedPath('en', '', '/ai_health/')).toBe('/ai_health/en/');
    expect(localizedPath('zh', 'fitness', '/ai_health/')).toBe('/ai_health/zh/fitness/');
    expect(localizedPath('zh', '/fitness/equipment/', '/ai_health/')).toBe('/ai_health/zh/fitness/equipment/');
  });
  it('switchLocale swaps the locale segment', () => {
    expect(switchLocale('/ai_health/en/fitness/', 'zh', '/ai_health/')).toBe('/ai_health/zh/fitness/');
    expect(switchLocale('/ai_health/zh/', 'en', '/ai_health/')).toBe('/ai_health/en/');
  });
  it('switchLocale falls back to the target home page', () => {
    expect(switchLocale('/ai_health/', 'zh', '/ai_health/')).toBe('/ai_health/zh/');
  });
  it('localeStaticPaths lists every locale', () => {
    expect(localeStaticPaths()).toEqual([{ params: { lang: 'en' } }, { params: { lang: 'zh' } }]);
  });
});
