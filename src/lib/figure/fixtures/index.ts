import type { SmithSquatSpec } from '../pose/smithSquat';
import { SMITH_SQUAT } from './smith-squat';

/** Every figure the renderer knows, by id. */
export const FIGURES: Record<string, SmithSquatSpec> = { [SMITH_SQUAT.id]: SMITH_SQUAT };
