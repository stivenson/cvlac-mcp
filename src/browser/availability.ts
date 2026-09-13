/**
 * Telling "CvLAC is down" apart from "your credentials are wrong".
 *
 * A 5xx from CvLAC is still a valid HTTP response, so Playwright navigates to it
 * happily and the failure only surfaces later, as a selector timeout or — worse —
 * as a list page with no rows, which reads as an empty section. An empty section
 * makes diff report every portfolio item as missing, and sync would re-add them.
 */

export class CvlacUnavailableError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'CvlacUnavailableError';
    this.status = status;
  }
}

/** Why this response means the site is down, or null if it does not. */
export function describeUnavailable(status: number | null): string | null {
  if (status === null) return 'CvLAC is unreachable (no response)';
  if (status >= 500) return `CvLAC is unavailable (HTTP ${status})`;
  return null;
}

/** Throws when the navigation landed on a down site. */
export function assertAvailable(status: number | null, url: string): void {
  const reason = describeUnavailable(status);
  if (!reason) return;
  throw new CvlacUnavailableError(
    `${reason} at ${url}. MinCiencias' site is not responding: this is not a problem ` +
      'with your credentials or with this server, and nothing was read or written. ' +
      'Wait for the site to come back and run the same tool again.',
    status
  );
}
