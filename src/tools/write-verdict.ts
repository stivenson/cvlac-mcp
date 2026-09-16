/**
 * Deciding whether a CvLAC write actually happened.
 *
 * Landing back on the form used to be read as a rejection. It is not: a live
 * run saved an experiencia row correctly and still came back to the edit form,
 * with no message beyond the page footer. So the URL alone cannot be the
 * verdict — when the server says nothing, the stored values decide.
 */

export type SubmitOutcome = 'saved' | 'rejected' | 'unverified';

export function classifySubmit(input: {
  landedOnForm: boolean;
  errors: string[];
  /** The submit landed on MinCiencias' outage page rather than on a CvLAC page. */
  outage?: boolean;
}): SubmitOutcome {
  // Leaving the form is normally the redirect that follows a save — unless what
  // came back was the outage page, which is not CvLAC answering at all.
  if (input.outage) return 'unverified';
  if (!input.landedOnForm) return 'saved';
  return input.errors.length > 0 ? 'rejected' : 'unverified';
}

/** MinCiencias' "Server Unavailable!" page, which arrives with any status. */
export function isOutageMarkup(html: string): boolean {
  return /server\s+unavailable/i.test(html ?? '');
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

export type VerificationVerdict = 'confirmed' | 'contradicted' | 'unreadable';

/**
 * What a reread of the form says about a write.
 *
 * The third answer is the one that matters. When CvLAC is down the reread comes
 * back empty, and an empty form contradicts nothing: two updates that CvLAC had
 * stored were reported as failures because "could not read it back" and "did
 * not save" were the same branch.
 */
export function verificationVerdict(
  stored: Record<string, string>,
  submitted: Record<string, string>
): VerificationVerdict {
  const comparable = Object.keys(submitted).filter((key) => key in stored);
  if (comparable.length === 0) return 'unreadable';
  return storedMatchesSubmitted(stored, submitted) ? 'confirmed' : 'contradicted';
}
