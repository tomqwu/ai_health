import type { Message } from '../i18n/format';

/**
 * Spec §7.1 as amended by D12: every unknown input has a typical value, so an exercise either fits or it
 * does not. (`needs-info` is reserved for inputs that cannot be defaulted; v1 has none, so it is left out.)
 */
export type FeasibilityStatus = 'feasible' | 'infeasible';

/** Spec §7.1 checks, in order. `pose` = the figure could not be posed at this stature. */
export type CheckId = 'capabilities' | 'attachments' | 'exclusions' | 'ceiling' | 'bar-travel' | 'bench-fit' | 'rom' | 'pose';

/** What would make a failing check pass. */
export type Unlock =
  | { kind: 'equipment'; equipmentIds: readonly string[] }
  | { kind: 'attachment'; attachmentId: string }
  | { kind: 'exclusion'; exerciseId: string };

export interface Reason {
  check: CheckId;
  message: Message;
  unlock?: Unlock;
}

/**
 * `checkFeasibility` result (spec §7.1). `reasons` explain failures. `notes` never block the exercise: they
 * say what to check yourself, e.g. overhead clearance under an assumed ceiling (D12).
 */
export interface Feasibility {
  status: FeasibilityStatus;
  reasons: Reason[];
  notes: Message[];
}
