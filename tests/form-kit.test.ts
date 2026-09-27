import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { relaxHiddenRequired } from '../src/tools/form-kit.js';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage();
}, 60000);

afterAll(async () => {
  await browser?.close();
});

describe('relaxHiddenRequired', () => {
  it('drops required from hidden controls and keeps it on visible ones', async () => {
    await page.setContent(`
      <form>
        <input name="txt_nme_prod" required>
        <div id="sec" style="display:none"><input name="sec_txt_nme_registrado" required></div>
        <input type="hidden" name="sec_id_institucion" required>
      </form>`);

    const relaxed = await relaxHiddenRequired(page);
    expect(relaxed.sort()).toEqual(['sec_id_institucion', 'sec_txt_nme_registrado']);
    expect(await page.$$eval('[required]', (els) => els.map((e) => e.getAttribute('name')))).toEqual([
      'txt_nme_prod',
    ]);
  });

  it('lets a form submit once hidden controls stop blocking it', async () => {
    await page.setContent(`
      <form onsubmit="window.__sent = true; return false;">
        <div style="display:none"><input name="sec_x" required></div>
        <button type="submit">Guardar</button>
      </form>`);

    await relaxHiddenRequired(page);
    await page.click('button');
    expect(await page.evaluate(() => (window as unknown as { __sent?: boolean }).__sent)).toBe(true);
  });
});
