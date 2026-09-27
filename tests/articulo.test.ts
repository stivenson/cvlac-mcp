import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fillArticulo, articuloLabel } from '../src/tools/products/articulo.js';
import { SECTION_SCHEMAS } from '../src/schemas.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cvlac');
let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage();
}, 60000);
afterAll(async () => {
  await browser?.close();
});

const REVISTA_HTML = `<option value='00000000005518'>(01205609) INGENIERIA E INVESTIGACION</option>`;
const values = (current: Page) => current.evaluate(() => Object.fromEntries(Array.from(new FormData(document.forms[0]).entries()).map(([key, value]) => [key, String(value)])));

describe('articulos schema', () => {
  it('requires a title, year and journal', () => {
    const schema = SECTION_SCHEMAS.articulos;
    expect(schema.safeParse({ title: 'X', year: '2024', issn: '0120-5609' }).success).toBe(true);
    expect(schema.safeParse({ title: 'X', year: '2024' }).success).toBe(false);
    expect(schema.safeParse({ title: 'X', year: '24', issn: '0120-5609' }).success).toBe(false);
  });
});

describe('fillArticulo', () => {
  it('fills the form and resolves the journal by ISSN', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'form-articulo.html'), 'utf8'));
    const report = { warnings: [] as string[] };
    await fillArticulo(page, {
      title: 'Artículo de ejemplo', tipo: 'revisión', year: '2024', month: '11', issn: '01205609',
      volumen: '44', fasciculo: '2', paginaInicial: '10', paginaFinal: '25', idioma: 'EN', medio: 'electrónico',
      url: 'https://example.org/a', doi: '10.1234/abc',
    }, report, { search: async () => REVISTA_HTML });
    expect(report.blockers ?? []).toEqual([]);
    expect(await values(page)).toMatchObject({
      cod_tipo_producto: '113', txt_nme_prod: 'Artículo de ejemplo', nro_ano_presenta: '2024', nro_mes_presenta: '11',
      cod_revista: '5518', cod_revista_otro: '', tpo_revista: 'PD', txt_volumen_revista: '44', txt_fasciculo_revista: '2',
      txt_pagina_inicial: '10', txt_pagina_final: '25', sgl_idioma: 'EN', tpo_medio_divulgacion: 'H', txt_doi: '10.1234/abc',
    });
  });

  it('blocks when the journal is absent and warns when month is omitted', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'form-articulo.html'), 'utf8'));
    const report = { warnings: [] as string[] };
    await fillArticulo(page, { title: 'X', year: '2024', issn: '9999-9999' }, report, { search: async () => '' });
    expect(report.blockers?.[0]).toMatch(/revista/);
    expect(report.warnings.some((warning) => warning.startsWith('nro_mes_presenta'))).toBe(true);
  });

  it('strips a doi.org prefix and labels by title', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'form-articulo.html'), 'utf8'));
    await fillArticulo(page, { title: 'X', year: '2024', issn: '0120-5609', doi: 'https://doi.org/10.1/X' }, { warnings: [] }, { search: async () => REVISTA_HTML });
    expect((await values(page)).txt_doi).toBe('10.1/X');
    expect(articuloLabel({ title: '  Título  ', year: '2024' })).toBe('Título');
  });
});
