/**
 * Every navigation this server makes goes through here.
 *
 * Two things the rest of the code should not have to think about: CvLAC answers
 * 5xx under bursts of requests (a 503 is often the site pushing back, not the
 * site being down), and it sometimes takes longer than a page load should. Both
 * deserve a paced retry rather than an immediate verdict.
 */
import type { Page } from 'playwright';
import { assertAvailable, CvlacUnavailableError, describeUnavailable } from './availability.js';
import {
  OutageBreaker,
  RequestPacer,
  backoffDelay,
  pacingSettings,
  parseRetryAfter,
  sleep,
  type BackoffOptions,
} from './pacing.js';

export interface NavigateOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  backoff?: BackoffOptions;
  /**
   * Return the failing status instead of throwing. For actions whose real
   * outcome is visible elsewhere — a delete is confirmed by the row being gone,
   * whatever the status of the delete link.
   */
  tolerateUnavailable?: boolean;
  pacer?: RequestPacer;
  breaker?: OutageBreaker;
}

export interface NavigateResult {
  status: number | null;
  attempts: number;
}

/**
 * One pacer per process, so the gap between requests holds across every tool
 * rather than resetting each call. Built on first use, after the environment
 * has been read.
 */
let sharedPacer: RequestPacer | null = null;

function pacerFor(settings: { minGapMs: number; jitterMs: number }): RequestPacer {
  sharedPacer ??= new RequestPacer(settings);
  return sharedPacer;
}

let sharedBreaker: OutageBreaker | null = null;

function breakerFor(settings: { breaker: { threshold: number; cooldownMs: number } }): OutageBreaker {
  sharedBreaker ??= new OutageBreaker(settings.breaker);
  return sharedBreaker;
}

export async function navigate(
  page: Page,
  url: string,
  opts: NavigateOptions = {}
): Promise<NavigateResult> {
  const settings = pacingSettings();
  const timeoutMs = opts.timeoutMs ?? settings.timeoutMs;
  const maxAttempts = opts.maxAttempts ?? settings.maxAttempts;
  const backoff = opts.backoff ?? settings.backoff;
  const pacer = opts.pacer ?? pacerFor(settings);
  const breaker = opts.breaker ?? breakerFor(settings);

  const cooldown = breaker.remainingMs();
  if (cooldown > 0) {
    throw new CvlacUnavailableError(
      `Requests to CvLAC are paused for ${Math.ceil(cooldown / 1000)}s: the site refused several in a row. ` +
        'This server backs off rather than keep knocking, which is what gets an account blocked. ' +
        'Nothing was read or written.',
      null
    );
  }

  let lastStatus: number | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await pacer.wait();

    let retryAfterMs: number | null = null;
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      lastStatus = response?.status() ?? null;
      lastError = null;

      if (!describeUnavailable(lastStatus)) {
        breaker.recordSuccess();
        return { status: lastStatus, attempts: attempt + 1 };
      }

      retryAfterMs = parseRetryAfter(response?.headers()['retry-after']);
    } catch (err) {
      lastError = err;
      lastStatus = null;
    }

    const isLastAttempt = attempt === maxAttempts - 1;
    if (isLastAttempt) break;

    const wait = retryAfterMs ?? backoffDelay(attempt, backoff).ms;
    await sleep(wait);
    pacer.noteSlept();
  }

  breaker.recordFailure();

  if (lastError) throw lastError;
  if (opts.tolerateUnavailable) return { status: lastStatus, attempts: maxAttempts };

  assertAvailable(lastStatus, url);
  return { status: lastStatus, attempts: maxAttempts };
}
