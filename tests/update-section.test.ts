import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  readFormErrors,
  listRowLabels,
  findRowActionHref,
  inferNivel,
  parsePeriod,
  inferParticipacionProy,
} from '../src/tools/update-section.js';

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

describe('inferNivel', () => {
  it.each([
    ['Maestría en Ciencia de Datos', '3'],
    ['Magister en Educación', '3'],
    ['Master of Science', '3'],
    ['Doctorado en Física', '4'],
    ['PhD in Computer Science', '4'],
    ['Especialización en Gerencia', '2'],
    ['Técnico en Electrónica', '9'],
    ['Ingeniería de Sistemas', '1'],
  ])('maps %s to CvLAC level %s', (degree, expected) => {
    expect(inferNivel(degree)).toBe(expected);
  });

  it('ignores accents when classifying', () => {
    expect(inferNivel('MAESTRIA EN IA')).toBe('3');
    expect(inferNivel('Especializacion en Datos')).toBe('2');
  });
});

describe('parsePeriod', () => {
  it('pulls the first two years out of free text', () => {
    expect(parsePeriod('Agosto 2010 - Julio 2015')).toEqual({ start: '2010', end: '2015' });
  });

  it('leaves the end empty for an open-ended period', () => {
    expect(parsePeriod('Febrero 2024 - Actualidad')).toEqual({ start: '2024', end: '' });
  });

  it('returns empty strings when there is no year at all', () => {
    expect(parsePeriod('Actualidad')).toEqual({ start: '', end: '' });
  });
});

describe('inferParticipacionProy', () => {
  it.each([
    ['Coinvestigador', 'CI'],
    ['Asesor externo', 'AS'],
    ['Estudiante de doctorado', 'ED'],
    ['Estudiante de maestría', 'EM'],
    ['Estudiante de pregrado', 'EP'],
    ['Investigador principal', 'IP'],
  ])('maps %s to %s', (role, expected) => {
    expect(inferParticipacionProy(role)).toBe(expected);
  });

  it('defaults to investigador principal when the role is absent', () => {
    expect(inferParticipacionProy(undefined)).toBe('IP');
    expect(inferParticipacionProy('')).toBe('IP');
  });
});

describe('readFormErrors', () => {
  it('picks up a red font message, the markup Struts pages use', async () => {
    await page.setContent(
      '<form><font color="red">Debe ingresar el año de obtención</font><input name="x"></form>'
    );
    expect(await readFormErrors(page)).toContain('Debe ingresar el año de obtención');
  });

  it('picks up class-based error blocks', async () => {
    await page.setContent('<div class="mensajeError">Campo obligatorio: Municipio</div>');
    expect(await readFormErrors(page)).toContain('Campo obligatorio: Municipio');
  });

  it('picks up inline red styling', async () => {
    await page.setContent('<span style="color: red">Falta la institución</span>');
    expect(await readFormErrors(page)).toContain('Falta la institución');
  });

  it('does not repeat the same message twice', async () => {
    await page.setContent(
      '<div class="error"><span class="error">Campo obligatorio</span></div>'
    );
    const errors = await readFormErrors(page);
    expect(errors.filter((e) => e === 'Campo obligatorio')).toHaveLength(1);
  });

  it('skips blocks long enough to be the whole page rather than a message', async () => {
    await page.setContent(`<div class="error">${'x'.repeat(400)}</div>`);
    expect(await readFormErrors(page)).toEqual([]);
  });

  it('returns nothing on a clean page', async () => {
    await page.setContent('<form><input name="x"></form>');
    expect(await readFormErrors(page)).toEqual([]);
  });

  it('caps the number of messages it returns', async () => {
    const many = Array.from({ length: 20 }, (_, i) => `<div class="error">Error ${i}</div>`).join('');
    await page.setContent(many);
    expect((await readFormErrors(page)).length).toBeLessThanOrEqual(10);
  });
});

describe('listRowLabels', () => {
  it('reads the label column of every data row', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'cursos.html'), 'utf-8'));
    expect(await listRowLabels(page, 1)).toEqual([
      'Taller de Introducción a la Programación',
      'Curso Práctico de Cómputo en la Nube',
      'Seminario de Ética Profesional',
    ]);
  });

  it('uses the column index the section declares', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'formacion.html'), 'utf-8'));
    expect(await listRowLabels(page, 5)).toEqual([
      'Maestría en Ciencia de Datos',
      'Ingeniería de Sistemas',
      'Técnico en Mantenimiento Electrónico',
    ]);
  });

  it('drops empty cells so they cannot match anything', async () => {
    await page.setContent(
      '<table><tr class="odd"><td>1</td><td></td></tr><tr class="even"><td>2</td><td>Real</td></tr></table>'
    );
    expect(await listRowLabels(page, 1)).toEqual(['Real']);
  });

  it('returns nothing when the list is empty', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'vacio.html'), 'utf-8'));
    expect(await listRowLabels(page, 1)).toEqual([]);
  });
});

describe('findRowActionHref', () => {
  it('finds the Editar link of the matching row', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'cursos.html'), 'utf-8'));
    const href = await findRowActionHref(page, 1, 'Seminario de Ética Profesional', 'Editar');
    expect(href).toBe('/cvlac/EnProdCurso/edit.do?id=3');
  });

  it('finds the Eliminar link of the matching row', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'cursos.html'), 'utf-8'));
    const href = await findRowActionHref(page, 1, 'Taller de Introducción a la Programación', 'Eliminar');
    expect(href).toBe('/cvlac/EnProdCurso/confirmDelete.do?id=1');
  });

  it('matches regardless of accents and case', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'cursos.html'), 'utf-8'));
    const href = await findRowActionHref(page, 1, 'SEMINARIO DE ETICA PROFESIONAL', 'Editar');
    expect(href).toBe('/cvlac/EnProdCurso/edit.do?id=3');
  });

  it('returns null when no row matches', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'cursos.html'), 'utf-8'));
    expect(await findRowActionHref(page, 1, 'Curso inexistente', 'Editar')).toBeNull();
  });
});
