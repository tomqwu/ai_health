export const LOCALES = ['en', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Text in every supported language. */
export type I18nText = Readonly<Record<Locale, string>>;

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

/** BCP 47 tag for <html lang> and hreflang. */
export const HTML_LANG: Record<Locale, string> = { en: 'en', zh: 'zh-Hans' };

/** Each language's name written in that language (for the toggle). */
export const LOCALE_LABEL: Record<Locale, string> = { en: 'English', zh: '中文' };

/** First supported locale in a browser preference list, else the default. */
export function pickLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
