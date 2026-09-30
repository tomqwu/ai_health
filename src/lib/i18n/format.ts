import { cmToDisplay, kgToDisplay, type LengthUnit, type MassUnit } from '../units';
import { t } from './index';
import type { MessageKey } from './en';
import type { I18nText, Locale } from './locales';

/**
 * A value substituted into a `{name}` placeholder:
 * - string / number: inserted as is
 * - I18nText: the text in the current language
 * - I18nText[]: joined with the language's list separator
 * - { lengthCm }: a length, shown in the user's length unit
 * - { key }: another dictionary entry
 */
export type MessageParam =
  | string
  | number
  | I18nText
  | readonly I18nText[]
  | { readonly lengthCm: number }
  | { readonly key: MessageKey };

/** A localizable message. Pure code (engine, profile) returns these; UI code formats them. */
export interface Message {
  key: MessageKey;
  params?: Readonly<Record<string, MessageParam>>;
}

export interface FormatOptions {
  /** Unit for `{ lengthCm }` params; default centimetres. */
  length?: LengthUnit;
}

const LIST_SEPARATOR: Record<Locale, string> = { en: ', ', zh: '、' };

/** `{value} cm` / `{value} 厘米`, or inches when the user prefers them. */
export function formatLength(locale: Locale, cm: number, unit: LengthUnit): string {
  return t(locale, unit === 'cm' ? 'unit.length.cm' : 'unit.length.in').replace('{value}', String(cmToDisplay(cm, unit)));
}

/** A metric mass shown in the user's mass unit. */
export function formatMass(locale: Locale, kg: number, unit: MassUnit): string {
  return formatLoad(locale, kgToDisplay(kg, unit), unit);
}

/** A load exactly as printed on a stack or dumbbell, in its printed unit (never converted). */
export function formatLoad(locale: Locale, value: number, unit: MassUnit): string {
  return t(locale, unit === 'kg' ? 'unit.mass.kg' : 'unit.mass.lb').replace('{value}', String(value));
}

function isI18nText(p: object): p is I18nText {
  return 'en' in p && 'zh' in p;
}

function formatParam(locale: Locale, p: MessageParam, opts: FormatOptions): string {
  if (typeof p === 'string' || typeof p === 'number') return String(p);
  if (Array.isArray(p)) return (p as readonly I18nText[]).map((x) => x[locale]).join(LIST_SEPARATOR[locale]);
  if ('lengthCm' in p) return formatLength(locale, p.lengthCm, opts.length ?? 'cm');
  if ('key' in p) return t(locale, p.key);
  if (isI18nText(p)) return p[locale];
  throw new Error(`formatMessage: unsupported param ${JSON.stringify(p)}`);
}

/** The message in `locale`, with every `{name}` placeholder filled. A missing param throws. */
export function formatMessage(locale: Locale, msg: Message, opts: FormatOptions = {}): string {
  return t(locale, msg.key).replace(/\{(\w+)\}/g, (_, name: string) => {
    const p = msg.params?.[name];
    if (p === undefined) throw new Error(`formatMessage: "${msg.key}" needs param "${name}"`);
    return formatParam(locale, p, opts);
  });
}

/** Placeholder names used by a dictionary string, sorted. */
export function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
}
