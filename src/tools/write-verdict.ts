/**
 * Deciding whether a CvLAC write actually happened.
 *
 * Landing back on the form used to be read as a rejection. It is not: a live
 * run saved an experiencia row correctly and still came back to the edit form,
 * with no message beyond the page footer. So the URL alone cannot be the
 * verdict — when the server says nothing, the stored values decide.
 */

export type SubmitOutcome = 'saved' | 'rejected' | 'unverified';

export function classifySubmit(input: { landedOnForm: boolean; errors: string[] }): SubmitOutcome {
  if (!input.landedOnForm) return 'saved';
  return input.errors.length > 0 ? 'rejected' : 'unverified';
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * What a filler changed on the form, as field/value pairs.
 *
 * Verification looks only at these. CvLAC rewrites some values it was given —
 * an institution name comes back in capitals, a date reformatted — and holding
 * untouched fields to the letter would fail writes that went through.
 */
export function changedFields(
  before: Record<string, string>,
  after: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) out[key] = value;
  }
  return out;
}

/**
 * Whether a freshly loaded form holds what was submitted.
 *
 * Only fields that appear on both sides are compared: CvLAC forms carry hidden
 * bookkeeping nobody submitted, and drop fields they do not use. If nothing
 * comparable survives, this reports false — an unconfirmed write, not a
 * confirmed one.
 */
export function storedMatchesSubmitted(
  stored: Record<string, string>,
  submitted: Record<string, string>
): boolean {
  const comparable = Object.keys(submitted).filter((key) => key in stored);
  if (comparable.length === 0) return false;
  return comparable.every((key) => norm(stored[key]) === norm(submitted[key]));
}
