import { z } from 'zod';
import { I18nTextSchema } from './common';
import { LOAD_UNITS } from './vocab';

/** Spec §5.1 parameter types, without the hole-numbering types (D12: no hole numbers in v1). */
export const PARAM_TYPES = ['cm', 'deg', 'bool', 'count', 'enum', 'enum-set', 'stack', 'weights'] as const;
export type ParamType = (typeof PARAM_TYPES)[number];

const LoadUnitSchema = z.enum(LOAD_UNITS);

/** A weight stack as printed: first and last number, the step between plates, and the printed unit. */
export const StackValueSchema = z
  .strictObject({ first: z.number().positive(), last: z.number().positive(), step: z.number().positive(), unit: LoadUnitSchema })
  .refine((v) => v.last > v.first, { message: 'last must be greater than first' });
export type StackValue = z.output<typeof StackValueSchema>;

/** Owned loads (e.g. dumbbell pairs) in their printed unit, strictly increasing. */
export const WeightsValueSchema = z
  .strictObject({ unit: LoadUnitSchema, loads: z.array(z.number().positive()).min(1) })
  .refine((v) => v.loads.every((x, i) => i === 0 || x > v.loads[i - 1]!), { message: 'loads must be strictly increasing' });
export type WeightsValue = z.output<typeof WeightsValueSchema>;

/** Any stored parameter value; `paramValueSchema(def)` narrows it to one definition. */
export const ParamValueSchema = z.union([
  z.number(),
  z.boolean(),
  z.string(),
  z.array(z.string()),
  StackValueSchema,
  WeightsValueSchema,
]);
export type ParamValue = z.output<typeof ParamValueSchema>;

const base = {
  label: I18nTextSchema,
  how: I18nTextSchema,
};
const Values = z.array(z.string().min(1)).min(1);

/**
 * How to measure one equipment parameter (spec §5.1). Values live only in the user's profile, and none is
 * ever required (D12): an unmeasured parameter uses the equipment's illustrative default.
 */
export const ParamDefSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('cm'), ...base }),
  z.strictObject({ type: z.literal('deg'), ...base }),
  z.strictObject({ type: z.literal('bool'), ...base }),
  z.strictObject({ type: z.literal('count'), ...base }),
  z.strictObject({ type: z.literal('enum'), values: Values, ...base }),
  z.strictObject({ type: z.literal('enum-set'), values: Values, ...base }),
  z.strictObject({ type: z.literal('stack'), ...base }),
  z.strictObject({ type: z.literal('weights'), ...base }),
]);
export type ParamDef = z.output<typeof ParamDefSchema>;

/** The schema a stored value must satisfy for this definition. */
export function paramValueSchema(def: ParamDef): z.ZodType {
  switch (def.type) {
    case 'cm':
      return z.number().positive();
    case 'deg':
      return z.number().min(-90).max(90);
    case 'bool':
      return z.boolean();
    case 'count':
      return z.number().int().min(0);
    case 'enum':
      return z.enum(def.values as [string, ...string[]]);
    case 'enum-set':
      return z
        .array(z.enum(def.values as [string, ...string[]]))
        .refine((a) => new Set(a).size === a.length, { message: 'values must be unique' });
    case 'stack':
      return StackValueSchema;
    case 'weights':
      return WeightsValueSchema;
  }
}

export function paramValueMatches(def: ParamDef, value: unknown): value is ParamValue {
  return paramValueSchema(def).safeParse(value).success;
}
