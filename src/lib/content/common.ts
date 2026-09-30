import { z } from 'zod';

/** Kebab-case id, unique per collection (spec §5). */
export const IdSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be kebab-case');

/** camelCase equipment parameter name, e.g. `smithLowestBarHeightCm`. */
export const ParamNameSchema = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'must be camelCase');

const CJK = /[㐀-鿿]/;

/** User-facing text in both languages (spec §5: the build fails if either is missing). */
export const I18nTextSchema = z.strictObject({
  en: z.string().trim().min(1),
  zh: z.string().trim().min(1).regex(CJK, 'zh text must contain Chinese characters'),
});
