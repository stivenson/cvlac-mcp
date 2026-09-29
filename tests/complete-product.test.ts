import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import {
  parseKeywordValue,
  readKeywordState,
  removedValues,
  sameOrderedCodes,
} from '../src/tools/complete-product.js';

describe('complete_product value helpers', () => {
  it('parses CvLAC keyword positions without confusing them with codes', () => {
    expect(parseKeywordValue('3.417', '3. Aprendizaje automático')).toEqual({
      code: '417',
      name: 'Aprendizaje automático',
    });
    expect(parseKeywordValue('', '')).toBeNull();
  });

  it('compares ordered lists by CvLAC code', () => {
    expect(sameOrderedCodes([{ code: '1' }, { code: '2' }], [{ code: '1' }, { code: '2' }])).toBe(true);
    expect(sameOrderedCodes([{ code: '1' }, { code: '2' }], [{ code: '2' }, { code: '1' }])).toBe(false);
  });

  it('reports only values dropped by a replacement list', () => {
    expect(
      removedValues(
        [{ code: '1', name: 'Primera' }, { code: '2', name: 'Segunda' }],
        [{ code: '2', name: 'Segunda' }]
      )
    ).toEqual(['Primera']);
  });
});

describe('readKeywordState', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
  }, 60000);

  afterAll(async () => {
    await browser?.close();
  });

  it('reads selected product words and the reusable personal catalogue', async () => {
    await page.setContent(`
      <select name="cod_palabra_clave" multiple>
        <option value="0.17">1. Datos abiertos</option>
        <option value="1.23">2. Investigación</option>
      </select>
      <a href="javascript:addPalabra('17', 'Datos abiertos')">Vincular</a>
      <a href="javascript:addPalabra('99', 'Aprendizaje automático')">Vincular</a>
    `);
    const state = await readKeywordState(page);
    expect(state.selected).toEqual([
      { code: '17', name: 'Datos abiertos' },
      { code: '23', name: 'Investigación' },
    ]);
    expect(state.personal).toEqual([
      { code: '17', name: 'Datos abiertos' },
      { code: '99', name: 'Aprendizaje automático' },
    ]);
  });
});
