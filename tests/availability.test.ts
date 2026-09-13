import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import {
  CvlacUnavailableError,
  assertAvailable,
  describeUnavailable,
} from '../src/browser/availability.js';
import { extractList } from '../src/extractors/cvlac/rows.js';

describe('describeUnavailable', () => {
  it('treats every 5xx as the site being down, not as our mistake', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(describeUnavailable(status), String(status)).toMatch(/unavailable/i);
    }
  });

  it('says nothing about a page that answered', () => {
    for (const status of [200, 302, 404]) {
      expect(describeUnavailable(status), String(status)).toBeNull();
    }
  });

  it('reports a missing response as unreachable, which is what a DNS or TLS failure gives', () => {
    expect(describeUnavailable(null)).toMatch(/unreachable|unavailable/i);
  });
});

describe('assertAvailable', () => {
  it('names the status and the URL so the user can tell a 503 from a login problem', () => {
    try {
      assertAvailable(503, 'https://scienti.minciencias.gov.co/cvlac/x/all.do');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CvlacUnavailableError);
      const e = err as CvlacUnavailableError;
      expect(e.status).toBe(503);
      expect(e.message).toContain('503');
      expect(e.message).toContain('scienti.minciencias.gov.co');
      expect(e.message).toMatch(/credential/i); // tells the user it is not their password
    }
  });

  it('lets a normal page through', () => {
    expect(() => assertAvailable(200, 'https://scienti.minciencias.gov.co/')).not.toThrow();
  });
});

describe('extractList against a CvLAC that is down', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  // The dangerous failure is not the error message: a 503 body carries no
  // tr.odd/tr.even, so the section used to read as empty. An empty CvLAC makes
  // diff report every portfolio item as missing, and sync would re-add them all.
  it('fails loudly instead of reporting the section as empty', async () => {
    await page.route('**/*', (route) =>
      route.fulfill({ status: 503, contentType: 'text/html; charset=utf-8', body: '<html><body>Service Unavailable</body></html>' })
    );

    await expect(
      extractList(page, 'formacion', 'https://scienti.minciencias.gov.co/cvlac/x/all.do', 2, () => null)
    ).rejects.toThrow(CvlacUnavailableError);
  });

  it('still reads a healthy page', async () => {
    await page.unroute('**/*');
    await page.route('**/*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<table><tr class="odd"><td>1</td><td>Ítem</td></tr></table>',
      })
    );

    const rows = await extractList(
      page,
      'formacion',
      'https://scienti.minciencias.gov.co/cvlac/x/all.do',
      2,
      (cells) => cells[1]
    );
    expect(rows).toEqual(['Ítem']);
  });
});
