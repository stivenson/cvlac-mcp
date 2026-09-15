import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { navigate } from '../src/browser/navigate.js';
import { OutageBreaker, RequestPacer } from '../src/browser/pacing.js';
import { CvlacUnavailableError } from '../src/browser/availability.js';

const URL = 'https://cvlac.test/section/all.do';

/**
 * Backoff short enough that a retry test is not a sleep test, and a pacer and
 * breaker of its own per test — both carry state that would otherwise leak from
 * one case into the next.
 */
const fast = () => ({
  maxAttempts: 3,
  backoff: { baseMs: 2, capMs: 10 },
  timeoutMs: 2000,
  pacer: new RequestPacer({ minGapMs: 0, jitterMs: 0 }),
  breaker: new OutageBreaker({ threshold: 99, cooldownMs: 0 }),
});

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  if (page) await page.close();
  page = await browser.newPage();
});

/** Serves each given status in turn; the last one repeats. */
async function serve(statuses: number[]): Promise<() => number> {
  let calls = 0;
  await page.route(URL, async (route) => {
    const status = statuses[Math.min(calls, statuses.length - 1)];
    calls++;
    await route.fulfill({ status, contentType: 'text/html', body: '<html><body>ok</body></html>' });
  });
  return () => calls;
}

describe('navigate', () => {
  it('does not retry a page that loads', async () => {
    const calls = await serve([200]);

    const result = await navigate(page, URL, fast());

    expect(result.status).toBe(200);
    expect(calls()).toBe(1);
  });

  it('retries a 503 and succeeds when the site comes back', async () => {
    const calls = await serve([503, 200]);

    const result = await navigate(page, URL, fast());

    expect(result.status).toBe(200);
    expect(calls()).toBe(2);
  });

  it('gives up on a site that stays down, naming it as an outage', async () => {
    await serve([503]);

    await expect(navigate(page, URL, fast())).rejects.toThrow(CvlacUnavailableError);
  });

  it('stops after the configured number of attempts', async () => {
    const calls = await serve([503]);

    await navigate(page, URL, fast()).catch(() => undefined);

    expect(calls()).toBe(3);
  });

  it('hands back the failing status instead of throwing when told to tolerate it', async () => {
    await serve([503]);

    const result = await navigate(page, URL, { ...fast(), tolerateUnavailable: true });

    expect(result.status).toBe(503);
  });

  it('stops sending once the site has refused repeatedly', async () => {
    const calls = await serve([503]);
    const breaker = new OutageBreaker({ threshold: 1, cooldownMs: 10000 });

    await navigate(page, URL, { ...fast(), breaker }).catch(() => undefined);
    const afterFirst = calls();
    await navigate(page, URL, { ...fast(), breaker }).catch(() => undefined);

    expect(calls()).toBe(afterFirst);
  });

  it('names the cooldown when it refuses to send', async () => {
    await serve([503]);
    const breaker = new OutageBreaker({ threshold: 1, cooldownMs: 10000 });

    await navigate(page, URL, { ...fast(), breaker }).catch(() => undefined);

    await expect(navigate(page, URL, { ...fast(), breaker })).rejects.toThrow(/pausad|paused|cooldown/i);
  });

  it('forgets the refusals once a request succeeds', async () => {
    const calls = await serve([503, 200]);
    const breaker = new OutageBreaker({ threshold: 2, cooldownMs: 10000 });

    await navigate(page, URL, { ...fast(), breaker });
    const afterFirst = calls();
    await navigate(page, URL, { ...fast(), breaker });

    expect(calls()).toBeGreaterThan(afterFirst);
  });

  it('retries a navigation that timed out', async () => {
    let calls = 0;
    await page.route(URL, async (route) => {
      calls++;
      if (calls === 1) return; // hang: the first navigation times out
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' });
    });

    const result = await navigate(page, URL, { ...fast(), timeoutMs: 250 });

    expect(result.status).toBe(200);
    expect(calls).toBe(2);
  });
});
