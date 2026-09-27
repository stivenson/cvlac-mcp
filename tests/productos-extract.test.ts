import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { headerKey, readRowsByHeader } from '../src/extractors/cvlac/productos.js';

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

describe('headerKey', () => {
  it('normalises a header to a key', () => {
    expect(headerKey('Título del capítulo')).toBe('titulo del capitulo');
    expect(headerKey('  Año ')).toBe('ano');
  });
});

describe('readRowsByHeader', () => {
  it('keys each row by its column header', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'lista-capitulos.html'), 'utf8'));
    expect(await readRowsByHeader(page)).toEqual([
      {
        'titulo del capitulo': 'Capítulo de ejemplo sobre redes',
        ano: '2024',
        'titulo del libro': 'Libro de ejemplo',
        'tipo producto': 'Capítulo de libro',
        categoria: '',
      },
    ]);
  });

  it('returns nothing for an empty list', async () => {
    await page.setContent('<table><tr class="odd"><td>Ningún dato disponible en esta tabla</td></tr></table>');
    expect(await readRowsByHeader(page)).toEqual([]);
  });

  it('finds a real-style header row after JMesa controls', async () => {
    await page.setContent(`<table class="table"><tr><td>15 50 100</td></tr><tr><th></th><th>Título del artículo</th><th>Año</th><th>Categoría</th><th>Detalles</th></tr><tr class="odd"><td>1</td><td>Artículo de prueba</td><td>2024</td><td></td><td>Detalles</td></tr></table>`);
    expect(await readRowsByHeader(page)).toEqual([{ 'titulo del articulo': 'Artículo de prueba', ano: '2024', categoria: '' }]);
  });

  it('recognises technical-product headers without a year column', async () => {
    await page.setContent(`<table class="table"><tr><td>15 50 100</td></tr><tr><th></th><th>Informe técnico</th><th>Categoría</th><th>Detalles</th></tr><tr class="odd"><td>1</td><td>Informe de prueba</td><td></td><td>Detalles</td></tr></table>`);
    expect(await readRowsByHeader(page)).toEqual([{ 'informe tecnico': 'Informe de prueba', categoria: '' }]);
  });
});
