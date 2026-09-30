import { withBase } from '../site';
import { en, type MessageKey } from './en';
import { zh } from './zh';
import { LOCALES, isLocale, type Locale } from './locales';

export * from './locales';
export type { MessageKey } from './en';

const DICTIONARIES = { en, zh } as const;

export function t(locale: Locale, key: MessageKey): string {
  return DICTIONARIES[locale][key];
}

/** Localized page path including the site base, always ending in "/". */
export function localizedPath(locale: Locale, path = '', base: string = import.meta.env?.BASE_URL ?? '/'): string {
  const clean = path.replace(/^\/+|\/+$/g, '');
  return withBase(clean ? `${locale}/${clean}/` : `${locale}/`, base);
}

/** The same page in another locale, or that locale's home page if the path has no locale segment. */
export function switchLocale(pathname: string, target: Locale, base: string = import.meta.env?.BASE_URL ?? '/'): string {
  const b = withBase('', base);
  const rest = pathname.startsWith(b) ? pathname.slice(b.length) : '';
  const [first, ...tail] = rest.split('/');
  if (first && (LOCALES as readonly string[]).includes(first)) return localizedPath(target, tail.join('/'), base);
  return localizedPath(target, '', base);
}

/** Narrow a route param to a supported locale, or throw. */
export function requireLocale(value: unknown): Locale {
  if (!isLocale(value)) throw new Error(`Unknown locale: ${String(value)}`);
  return value;
}

export function localeStaticPaths() {
  return LOCALES.map((lang) => ({ params: { lang } }));
}
