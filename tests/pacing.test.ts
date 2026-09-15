import { describe, it, expect } from 'vitest';
import {
  backoffDelay,
  OutageBreaker,
  pacingSettings,
  parseRetryAfter,
  RequestPacer,
} from '../src/browser/pacing.js';

describe('backoffDelay', () => {
  it('grows with each attempt', () => {
    const first = backoffDelay(0, { baseMs: 1000, capMs: 60000 });
    const third = backoffDelay(2, { baseMs: 1000, capMs: 60000 });
    expect(third.max).toBeGreaterThan(first.max);
  });

  it('never exceeds the cap, however many attempts have failed', () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(backoffDelay(attempt, { baseMs: 1000, capMs: 8000 }).max).toBeLessThanOrEqual(8000);
    }
  });

  it('jitters, so parallel clients do not retry in lockstep', () => {
    const draws = new Set(
      Array.from({ length: 30 }, () => backoffDelay(3, { baseMs: 1000, capMs: 60000 }).ms)
    );
    expect(draws.size).toBeGreaterThan(1);
  });
});

describe('parseRetryAfter', () => {
  it('reads a delay given in seconds', () => {
    expect(parseRetryAfter('120')).toBe(120000);
  });

  it('reads a delay given as an HTTP date', () => {
    const tenSecondsOut = new Date(Date.now() + 10000).toUTCString();
    const ms = parseRetryAfter(tenSecondsOut);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(11000);
  });

  it('ignores a header it cannot read', () => {
    expect(parseRetryAfter('soon')).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });

  it('ignores a date already in the past', () => {
    expect(parseRetryAfter(new Date(Date.now() - 60000).toUTCString())).toBeNull();
  });
});

describe('RequestPacer', () => {
  it('lets the first request through without waiting', async () => {
    const pacer = new RequestPacer({ minGapMs: 500, jitterMs: 0 });
    const started = Date.now();
    await pacer.wait();
    expect(Date.now() - started).toBeLessThan(100);
  });

  it('spaces successive requests by the minimum gap', async () => {
    const pacer = new RequestPacer({ minGapMs: 200, jitterMs: 0 });
    await pacer.wait();
    const started = Date.now();
    await pacer.wait();
    expect(Date.now() - started).toBeGreaterThanOrEqual(150);
  });

  it('does not make a caller wait for a gap that already elapsed', async () => {
    const pacer = new RequestPacer({ minGapMs: 50, jitterMs: 0 });
    await pacer.wait();
    await new Promise((r) => setTimeout(r, 80));
    const started = Date.now();
    await pacer.wait();
    expect(Date.now() - started).toBeLessThan(40);
  });
});

describe('pacingSettings', () => {
  it('ships with delays a human browsing could produce', () => {
    const s = pacingSettings({});
    expect(s.minGapMs).toBeGreaterThan(0);
    expect(s.maxAttempts).toBeGreaterThan(1);
    expect(s.timeoutMs).toBeGreaterThanOrEqual(20000);
  });

  it('lets a slow connection raise the navigation timeout', () => {
    expect(pacingSettings({ CVLAC_NAV_TIMEOUT_MS: '60000' }).timeoutMs).toBe(60000);
  });

  it('lets a throttled account slow every request down', () => {
    const s = pacingSettings({ CVLAC_MIN_REQUEST_GAP_MS: '5000', CVLAC_REQUEST_JITTER_MS: '2000' });
    expect(s.minGapMs).toBe(5000);
    expect(s.jitterMs).toBe(2000);
  });

  it('lets a run turn retries off', () => {
    expect(pacingSettings({ CVLAC_NAV_MAX_ATTEMPTS: '1' }).maxAttempts).toBe(1);
  });

  it('keeps at least one attempt, whatever the variable says', () => {
    expect(pacingSettings({ CVLAC_NAV_MAX_ATTEMPTS: '0' }).maxAttempts).toBe(1);
    expect(pacingSettings({ CVLAC_NAV_MAX_ATTEMPTS: '-3' }).maxAttempts).toBe(1);
  });

  it('falls back to the default when a variable is not a number', () => {
    expect(pacingSettings({ CVLAC_MIN_REQUEST_GAP_MS: 'lento' }).minGapMs).toBe(
      pacingSettings({}).minGapMs
    );
  });
});

describe('OutageBreaker', () => {
  it('stays closed while requests succeed', () => {
    const breaker = new OutageBreaker({ threshold: 2, cooldownMs: 1000 });
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(false);
  });

  it('opens once the site has refused enough times in a row', () => {
    const breaker = new OutageBreaker({ threshold: 2, cooldownMs: 1000 });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(true);
  });

  it('lets traffic through again after the cooldown', async () => {
    const breaker = new OutageBreaker({ threshold: 1, cooldownMs: 30 });
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(breaker.isOpen()).toBe(false);
  });

  it('says how long the caller should wait', () => {
    const breaker = new OutageBreaker({ threshold: 1, cooldownMs: 5000 });
    breaker.recordFailure();
    expect(breaker.remainingMs()).toBeGreaterThan(0);
    expect(breaker.remainingMs()).toBeLessThanOrEqual(5000);
  });
});
