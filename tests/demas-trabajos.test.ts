import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { medioDivulgacion, isFormUrl } from '../src/tools/update-section.js';
import { extractDemasTrabajosFromPage } from '../src/extractors/cvlac/demas-trabajos.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cvlac');

// tpo_medio_divulgacion offers three values: I Papel, H Internet, O Otro.
describe('medioDivulgacion', () => {
  it.each([
    ['Papel', 'I'],
    ['Internet', 'H'],
    ['Otro', 'O'],
  ])('maps %s to %s', (text, code) => {
    expect(medioDivulgacion(text)).toBe(code);
  });

  it('takes a web page for what CvLAC calls Internet', () => {
    expect(medioDivulgacion('web')).toBe('H');
    expect(medioDivulgacion('Página web')).toBe('H');
  });

  it('ignores case and accents, and accepts the codes', () => {
    expect(medioDivulgacion('PAPEL')).toBe('I');
    expect(medioDivulgacion('H')).toBe('H');
  });

  // The form preselects Papel. A value it cannot place is left to warn rather
  // than stored as paper, which would read as right.
  it('refuses a medium it does not recognise', () => {
    expect(medioDivulgacion('televisión y radio')).toBeNull();
    expect(medioDivulgacion('')).toBeNull();
  });
});

describe('extractDemasTrabajosFromPage', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
  }, 60000);

  afterAll(async () => {
    await browser?.close();
  });

  it('reads the name and the year of every work', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'lista-demas-trabajos.html'), 'utf8'));
    expect(await extractDemasTrabajosFromPage(page)).toEqual([
      { name: 'Portal de ejemplo para gestión de tutorías', year: '2026' },
      { name: 'Guía técnica de ejemplo', year: '2019' },
    ]);
  });

  it('returns nothing for an empty list rather than a phantom row', async () => {
    await page.setContent('<table><tr class="odd"><td>Ningún dato disponible en esta tabla</td></tr></table>');
    expect(await extractDemasTrabajosFromPage(page)).toEqual([]);
  });
});

// "Landed back on the form" is how a rejected submit is told from a saved one.
// It matched insert.do and friends literally, so a rejection on
// insert_demasTrabajos.do would have read as a save.
describe('isFormUrl', () => {
  it.each([
    'https://x/cvlac/EnProdCurso/insert.do?__tipo=2B',
    'https://x/cvlac/EnProdCurso/edit.do?cod_producto=1',
    'https://x/cvlac/EnProdTecnica/insert_demasTrabajos.do',
    'https://x/cvlac/EnProdTecnica/update_demasTrabajos.do',
    'https://x/cvlac/EnProdTecnica/create_demasTrabajos.do',
    'https://x/cvlac/EnProdTecnica/edit_demasTrabajos.do?cod_producto=15',
  ])('treats %s as a form', (url) => {
    expect(isFormUrl(url)).toBe(true);
  });

  it.each([
    'https://x/cvlac/EnProdTecnica/all_demasTrabajos.do',
    'https://x/cvlac/EnProdCurso/all.do?__tipo=2B',
    'https://x/cvlac/EnProdTecnica/query_demasTrabajos.do?cod_producto=15',
  ])('does not treat the list or the record page %s as a form', (url) => {
    expect(isFormUrl(url)).toBe(false);
  });
});
