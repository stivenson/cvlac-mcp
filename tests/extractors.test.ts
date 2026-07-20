import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { extractFormacionFromPage } from '../src/extractors/cvlac/formacion.js';
import { extractExperienciaFromPage } from '../src/extractors/cvlac/experiencia.js';
import { extractCursosFromPage } from '../src/extractors/cvlac/cursos.js';
import { extractReconocimientosFromPage } from '../src/extractors/cvlac/reconocimientos.js';
import { extractProyectosFromPage } from '../src/extractors/cvlac/proyectos.js';
import { extractSoftwareFromPage } from '../src/extractors/cvlac/software.js';
import { extractEventosFromPage } from '../src/extractors/cvlac/eventos.js';
import { readRows } from '../src/extractors/cvlac/rows.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cvlac');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, `${name}.html`), 'utf-8');
}

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage();
}, 60000);

afterAll(async () => {
  await browser?.close();
});

/** Loads a fixture into the page so the extractor sees the same DOM CvLAC would produce. */
async function load(name: string): Promise<void> {
  await page.setContent(fixture(name));
}

describe('readRows', () => {
  it('reads only tr.odd/tr.even, skipping the header row', async () => {
    await load('formacion');
    const rows = await readRows(page);
    expect(rows).toHaveLength(3);
    expect(rows[0][0]).toBe('1');
  });

  it('collapses whitespace inside cells', async () => {
    await page.setContent('<table><tr class="odd"><td>1</td><td>  Un\n  ítem  </td></tr></table>');
    const rows = await readRows(page);
    expect(rows[0][1]).toBe('Un ítem');
  });

  it('returns nothing when the row classes are not the ones CvLAC uses', async () => {
    await load('layout-cambiado');
    expect(await readRows(page)).toHaveLength(0);
  });
});

describe('extractFormacionFromPage', () => {
  it('reads institución from column 4 and programa from column 5', async () => {
    await load('formacion');
    const items = await extractFormacionFromPage(page);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      institution: 'Universidad Nacional de Colombia',
      degree: 'Maestría en Ciencia de Datos',
      period: '2018-2020',
    });
  });

  it('builds the period from the start and graduation year columns', async () => {
    await load('formacion');
    const items = await extractFormacionFromPage(page);
    expect(items[1].period).toBe('2010-2015');
  });
});

describe('extractExperienciaFromPage', () => {
  it('reads the company and leaves role empty (the list view has no cargo column)', async () => {
    await load('experiencia');
    const items = await extractExperienciaFromPage(page);
    expect(items).toHaveLength(3);
    expect(items[0].company).toBe('Empresa Ejemplo S.A.S.');
    expect(items[0].role).toBe('');
    expect(items[0].period).toBe('2021-2025');
  });
});

describe('extractCursosFromPage', () => {
  it('reads name and year', async () => {
    await load('cursos');
    const items = await extractCursosFromPage(page);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ name: 'Taller de Introducción a la Programación', date: '2024' });
  });
});

describe('extractReconocimientosFromPage', () => {
  it('reads column 2 as the year, not as a description', async () => {
    await load('reconocimientos');
    const items = await extractReconocimientosFromPage(page);
    expect(items).toEqual([
      { title: 'Mención de Honor en Innovación', year: '2024' },
      { title: 'Beca de Excelencia Académica', year: '2018' },
    ]);
  });
});

describe('name-only extractors', () => {
  it('extractProyectosFromPage reads titles', async () => {
    await load('proyectos');
    const items = await extractProyectosFromPage(page);
    expect(items.map((i) => i.title)).toEqual([
      'Plataforma de Analítica Regional',
      'Sistema de Monitoreo Ambiental',
    ]);
  });

  it('extractSoftwareFromPage reads names', async () => {
    await load('software');
    const items = await extractSoftwareFromPage(page);
    expect(items.map((i) => i.name)).toEqual([
      'Biblioteca de Componentes Accesibles',
      'Simulador de Rutas Urbanas',
    ]);
  });

  it('extractEventosFromPage reads names', async () => {
    await load('eventos');
    const items = await extractEventosFromPage(page);
    expect(items.map((i) => i.name)).toEqual([
      'Congreso Nacional de Ingeniería',
      'Encuentro Regional de Investigación',
    ]);
  });
});

describe('degenerate pages', () => {
  it('returns an empty list for a section with no records', async () => {
    await load('vacio');
    expect(await extractCursosFromPage(page)).toEqual([]);
  });

  it('returns an empty list when the markup changed, rather than throwing', async () => {
    await load('layout-cambiado');
    expect(await extractFormacionFromPage(page)).toEqual([]);
    expect(await extractEventosFromPage(page)).toEqual([]);
  });

  it('drops rows whose label cell is empty', async () => {
    await page.setContent(
      '<table>' +
        '<tr class="odd"><td>1</td><td></td><td>2024</td></tr>' +
        '<tr class="even"><td>2</td><td>Curso real</td><td>2023</td></tr>' +
        '</table>'
    );
    const items = await extractCursosFromPage(page);
    expect(items).toEqual([{ name: 'Curso real', date: '2023' }]);
  });
});
