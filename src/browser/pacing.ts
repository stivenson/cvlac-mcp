/**
 * Keeping CvLAC from treating this server as a bot.
 *
 * MinCiencias' site sits behind something that starts answering 5xx when
 * requests arrive back to back — a live CRUD run over the seven sections hit it
 * on three of them. Two habits avoid it: never fire two navigations closer than
 * a human would, and back off (rather than hammer) when the site pushes back.
 */

export interface BackoffOptions {
  /** Delay after the first failure; doubles per attempt. */
  baseMs: number;
  /** Ceiling, so a long outage does not turn into an hour-long sleep. */
  capMs: number;
}

/**
 * How long to wait before retry number `attempt` (0-based).
 *
 * Half the window is fixed and half is random: the fixed half guarantees the
 * delay actually grows, the random half keeps retries from lining up.
 */
export function backoffDelay(attempt: number, opts: BackoffOptions): { ms: number; max: number } {
  const max = Math.min(opts.capMs, opts.baseMs * 2 ** attempt);
  const ms = Math.round(max / 2 + Math.random() * (max / 2));
  return { ms, max };
}

/** `Retry-After` in milliseconds — seconds or HTTP date — or null if unreadable. */
export function parseRetryAfter(header: string | null | undefined): number | null {
  if (!header) return null;
  const trimmed = header.trim();

  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;

  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;

  const ms = at - Date.now();
  return ms > 0 ? ms : null;
}

export interface PacerOptions {
  /** Shortest gap allowed between two requests. */
  minGapMs: number;
  /** Extra random delay on top, so the rhythm is not machine-perfect. */
  jitterMs: number;
}

/** Spaces out requests so a burst never looks like a burst. */
export class RequestPacer {
  private last: number | null = null;

  constructor(private readonly opts: PacerOptions) {}

  /** Resolves once enough time has passed since the previous request. */
  async wait(): Promise<void> {
    const gap = this.opts.minGapMs + Math.random() * this.opts.jitterMs;
    if (this.last !== null) {
      const remaining = gap - (Date.now() - this.last);
      if (remaining > 0) await sleep(remaining);
    }
    this.last = Date.now();
  }

  /** Counts a delay taken elsewhere (a backoff) as time already spent waiting. */
  noteSlept(): void {
    this.last = Date.now();
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface BreakerOptions {
  /** Consecutive failed navigations before traffic stops. */
  threshold: number;
  /** How long to stay quiet once it trips. */
  cooldownMs: number;
}

/**
 * Stops the server from hammering a site that is already refusing it.
 *
 * Retries are per navigation, so a sync across seven sections could knock
 * twenty times on a door that answered 503 the first three. After enough
 * consecutive refusals this holds every further request until the site has had
 * time to recover — the difference between a client that is patient and one
 * that gets blocked.
 */
export class OutageBreaker {
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

  constructor(private readonly opts: BreakerOptions) {}

  recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.opts.threshold) this.openedAt = Date.now();
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openedAt = null;
  }

  isOpen(): boolean {
    return this.remainingMs() > 0;
  }

  /** Milliseconds left before requests are allowed again; 0 when they are. */
  remainingMs(): number {
    if (this.openedAt === null) return 0;
    const left = this.opts.cooldownMs - (Date.now() - this.openedAt);
    if (left <= 0) {
      this.openedAt = null;
      this.consecutiveFailures = 0;
      return 0;
    }
    return left;
  }
}

export interface PacingSettings extends PacerOptions {
  timeoutMs: number;
  maxAttempts: number;
  backoff: BackoffOptions;
  breaker: BreakerOptions;
}

const DEFAULT_SETTINGS: PacingSettings = {
  // Roughly a page a second, jittered: slow enough not to look scripted, fast
  // enough that syncing seven sections stays a coffee break.
  minGapMs: 900,
  jitterMs: 700,
  timeoutMs: 30000,
  maxAttempts: 3,
  backoff: { baseMs: 2000, capMs: 30000 },
  breaker: { threshold: 3, cooldownMs: 120000 },
};

function num(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw?.trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * How hard this process is allowed to push CvLAC.
 *
 * Every value is an environment variable because the right answer depends on
 * the day: MinCiencias throttles harder at some hours, and a run that started
 * collecting 503s should be slowed down without editing code.
 */
export function pacingSettings(env: NodeJS.ProcessEnv = process.env): PacingSettings {
  return {
    minGapMs: num(env.CVLAC_MIN_REQUEST_GAP_MS, DEFAULT_SETTINGS.minGapMs),
    jitterMs: num(env.CVLAC_REQUEST_JITTER_MS, DEFAULT_SETTINGS.jitterMs),
    timeoutMs: num(env.CVLAC_NAV_TIMEOUT_MS, DEFAULT_SETTINGS.timeoutMs),
    maxAttempts: Math.max(1, num(env.CVLAC_NAV_MAX_ATTEMPTS, DEFAULT_SETTINGS.maxAttempts)),
    backoff: {
      baseMs: num(env.CVLAC_BACKOFF_BASE_MS, DEFAULT_SETTINGS.backoff.baseMs),
      capMs: num(env.CVLAC_BACKOFF_CAP_MS, DEFAULT_SETTINGS.backoff.capMs),
    },
    breaker: {
      threshold: Math.max(1, num(env.CVLAC_OUTAGE_THRESHOLD, DEFAULT_SETTINGS.breaker.threshold)),
      cooldownMs: num(env.CVLAC_OUTAGE_COOLDOWN_MS, DEFAULT_SETTINGS.breaker.cooldownMs),
    },
  };
}
