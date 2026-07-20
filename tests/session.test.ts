import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { isLoginPage } from '../src/browser/session.js';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage();
}, 60000);

afterAll(async () => {
  await browser?.close();
});

describe('isLoginPage', () => {
  // Regression: CvLAC answers an unauthenticated request to a list page by
  // serving the login form under the *same* URL. Checking only the URL reported
  // the dead session as valid, and every extractor then scraped an empty list —
  // which the diff read as "nothing is in CvLAC yet".
  it('detects the login form served in place of a list page', async () => {
    await page.setContent(
      '<form action="/cvlac/Login/s_login.do">' +
        '<input id="txt_contrasena" name="txt_contrasena" type="password">' +
        '</form>'
    );
    expect(await isLoginPage(page)).toBe(true);
  });

  it('detects it by the form action alone', async () => {
    await page.setContent('<form action="/cvlac/Login/s_login.do"><input name="otro"></form>');
    expect(await isLoginPage(page)).toBe(true);
  });

  it('detects the password field by name when it carries no id', async () => {
    await page.setContent('<input name="txt_contrasena" type="password">');
    expect(await isLoginPage(page)).toBe(true);
  });

  it('accepts a real list page as authenticated', async () => {
    await page.setContent(
      '<table><tr class="odd"><td>1</td><td>Un ítem</td></tr></table>'
    );
    expect(await isLoginPage(page)).toBe(false);
  });

  it('accepts an empty list page as authenticated', async () => {
    await page.setContent('<table><tr class="noData"><td>No se encontraron registros</td></tr></table>');
    expect(await isLoginPage(page)).toBe(false);
  });
});
