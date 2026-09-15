import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { extractDetailFields } from '../src/tools/read-cvlac-detail.js';
import { findRowActionHref } from '../src/tools/update-section.js';
import { SECTION_LIST } from '../src/browser/navigation.js';
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

async function load(name: string): Promise<void> {
  await page.setContent(readFileSync(join(FIXTURES, `${name}.html`), 'utf-8'));
}

describe('extractDetailFields', () => {
  it('pairs every caption cell with the cell that follows it', async () => {
    await load('detalle-reconocimiento');
    const fields = await extractDetailFields(page);
    const byLabel = Object.fromEntries(fields.map((f) => [f.label, f.value]));

    expect(byLabel['Nombre']).toBe('Mención de Honor en Innovación');
    expect(byLabel['Año']).toBe('2024');
    expect(byLabel['Ámbito']).toBe('Nacional');
    expect(byLabel['Institución']).toBe('Universidad Ficticia del Norte');
    expect(byLabel['Descripción']).toBe('Texto de descripción del reconocimiento.');
  });

  it('strips the trailing colon, so callers can look a field up by its name', async () => {
    await load('detalle-reconocimiento');
    const fields = await extractDetailFields(page);
    for (const f of fields) expect(f.label).not.toMatch(/:$/);
  });

  it('drops full-width rows and empty values instead of inventing fields', async () => {
    await load('detalle-reconocimiento');
    const fields = await extractDetailFields(page);
    expect(fields.map((f) => f.label)).not.toContain('Vacío');
    expect(fields.some((f) => f.label.includes('ocupa toda la fila'))).toBe(false);
  });

  it('returns nothing rather than guessing when the layout has no pairs', async () => {
    await load('detalle-sin-pares');
    expect(await extractDetailFields(page)).toEqual([]);
  });
});

// The EnProd* sections (cursos, software, eventos) lay a record out as a row of
// bold captions followed by a row of values. Pairing cells inside a row there
// produced nonsense like "Ciudad = Disponibilidad", and made every check of what
// an update had stored fail.
describe('extractDetailFields on a record laid out in caption rows', () => {
  it('pairs a caption row with the values on the row below it', async () => {
    await load('detalle-software');
    const byLabel = Object.fromEntries(
      (await extractDetailFields(page)).map((f) => [f.label, f.value])
    );

    expect(byLabel['Ciudad']).toBe('Pamplona');
    expect(byLabel['Disponibilidad']).toBe('Restringido');
  });

  it('reads the nested table CvLAC uses for multi-column blocks', async () => {
    await load('detalle-software');
    const byLabel = Object.fromEntries(
      (await extractDetailFields(page)).map((f) => [f.label, f.value])
    );

    expect(byLabel['Año(*)']).toBe('2021');
    expect(byLabel['Mes']).toBe('Marzo');
  });

  it('pairs a caption that occupies its whole row with the value below', async () => {
    await load('detalle-software');
    const byLabel = Object.fromEntries(
      (await extractDetailFields(page)).map((f) => [f.label, f.value])
    );

    expect(byLabel['Nombre del software']).toBe('Catálogo de Rutas Urbanas');
    expect(byLabel['Tipo de software']).toBe('Computacional');
    expect(byLabel['Sitio web (URL)']).toBe('https://example.org/rutas');
  });

  it('never pairs one caption with another', async () => {
    await load('detalle-software');
    const fields = await extractDetailFields(page);

    expect(fields.map((f) => f.value)).not.toContain('Disponibilidad');
    expect(fields.map((f) => f.value)).not.toContain('Mes');
  });

  it('reads a caption row padded with spacer cells', async () => {
    await load('detalle-curso');
    const byLabel = Object.fromEntries(
      (await extractDetailFields(page)).map((f) => [f.label, f.value])
    );

    expect(byLabel['Tipo de producto']).toBe('Extensión extracurricular');
    expect(byLabel['Año']).toBe('2020');
    expect(byLabel['Mes']).toBe('Noviembre');
  });

  it('leaves out a caption whose value is empty', async () => {
    await load('detalle-software');
    const fields = await extractDetailFields(page);

    expect(fields.map((f) => f.label)).not.toContain('País(*)');
  });
});

describe('finding the Detalles link', () => {
  it('resolves a row by its label, ignoring case and accents', async () => {
    await load('reconocimientos');
    const href = await findRowActionHref(page, 1, 'mencion de honor en innovacion', 'Detalles');
    expect(href).toMatch(/detalle\.do\?id=1/);
  });

  it('tells Detalles apart from Editar and Eliminar in the same row', async () => {
    await load('reconocimientos');
    expect(await findRowActionHref(page, 1, 'Beca de Excelencia Académica', 'Editar')).toMatch(
      /edit\.do\?id=2/
    );
    expect(await findRowActionHref(page, 1, 'Beca de Excelencia Académica', 'Eliminar')).toMatch(
      /confirmDelete\.do\?id=2/
    );
  });

  it('returns null when no row carries the label, so the tool can say so', async () => {
    await load('reconocimientos');
    expect(await findRowActionHref(page, 1, 'No existe este ítem', 'Detalles')).toBeNull();
  });
});

describe('SECTION_LIST', () => {
  // update-section and read-cvlac-detail both locate rows through this map; a
  // section missing from it would make one of them fail at runtime only.
  it('covers every section the server accepts', () => {
    expect(Object.keys(SECTION_LIST).sort()).toEqual(Object.keys(SECTION_SCHEMAS).sort());
  });

  it('reads formación by its degree column, not the institution one', () => {
    expect(SECTION_LIST.formacion.matchCellIndex).toBe(5);
  });
});
