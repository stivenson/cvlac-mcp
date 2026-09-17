import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { languageLevel, levelName, fillIdioma } from '../src/tools/update-section.js';
import { extractIdiomasFromPage } from '../src/extractors/cvlac/idiomas.js';
import { extractLineasFromPage } from '../src/extractors/cvlac/lineas.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cvlac');

// CvLAC's four radio groups all carry the same three values.
describe('languageLevel', () => {
  it.each([
    ['Bueno', 'B'],
    ['bueno', 'B'],
    ['Aceptable', 'R'],
    ['Deficiente', 'P'],
  ])('maps %s to %s', (text, code) => {
    expect(languageLevel(text)).toBe(code);
  });

  it('accepts the codes themselves, for a caller that already knows them', () => {
    expect(languageLevel('B')).toBe('B');
    expect(languageLevel('R')).toBe('R');
  });

  it('ignores accents and case', () => {
    expect(languageLevel('DEFICIENTE')).toBe('P');
  });

  // Inventing a level in an official record is worse than leaving it unset.
  it('refuses a level it does not recognise', () => {
    expect(languageLevel('regular tirando a bueno')).toBeNull();
    expect(languageLevel('')).toBeNull();
  });
});

describe('levelName', () => {
  it('reads the code back as the word CvLAC prints', () => {
    expect(levelName('B')).toBe('Bueno');
    expect(levelName('R')).toBe('Aceptable');
    expect(levelName('P')).toBe('Deficiente');
  });
});

describe('extractors', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
  }, 60000);

  afterAll(async () => {
    await browser?.close();
  });

  it('reads every language with its four levels', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'lista-idiomas.html'), 'utf8'));
    expect(await extractIdiomasFromPage(page)).toEqual([
      { language: 'Inglés', read: 'Aceptable', write: 'Aceptable', speak: 'Deficiente', listen: 'Bueno' },
      { language: 'Español', read: 'Bueno', write: 'Bueno', speak: 'Bueno', listen: 'Bueno' },
    ]);
  });

  // The list of research lines carries nothing but the name; the objective and
  // the active flag only exist on the record page.
  it('reads the research lines by name', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'lista-lineas.html'), 'utf8'));
    expect(await extractLineasFromPage(page)).toEqual([
      { name: 'Inteligencia Artificial.' },
      { name: 'Tecnologías de La información' },
    ]);
  });

  it('returns nothing for an empty list rather than a phantom row', async () => {
    await page.setContent('<table><tr class="odd"><td>Ningún dato disponible en esta tabla</td></tr></table>');
    expect(await extractIdiomasFromPage(page)).toEqual([]);
    expect(await extractLineasFromPage(page)).toEqual([]);
  });
});

// The edit form has no language select: the language is the key, and travels in
// a hidden field. Resolving it there found no options, and the filler gave up
// before touching a single radio — so the submit carried the stored levels back
// unchanged and CvLAC's redirect read as "Updated".
describe('fillIdioma on the edit form', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
  }, 60000);

  afterAll(async () => {
    await browser?.close();
  });

  const EDIT_FORM = `
    <form action="/cvlac/ReRecursoHumIdioma/update.do">
      <input type="hidden" name="sgl_idioma" value="IT">
      ${['leer', 'escribir', 'hablar', 'escuchar']
        .map(
          (s) => `
        <input type="radio" name="tpo_nivel_${s}" value="P">
        <input type="radio" name="tpo_nivel_${s}" value="R" checked>
        <input type="radio" name="tpo_nivel_${s}" value="B">`
        )
        .join('')}
    </form>`;

  it('sets the levels even though there is no language select', async () => {
    await page.setContent(EDIT_FORM);
    const report = { warnings: [] as string[] };
    await fillIdioma(page, { language: 'Italiano', read: 'Deficiente', level: 'Bueno' }, report);

    const chosen = (name: string) =>
      page.$eval(`input[name="${name}"]:checked`, (el) => (el as HTMLInputElement).value);
    expect(await chosen('tpo_nivel_leer')).toBe('P');
    expect(await chosen('tpo_nivel_escribir')).toBe('B');
    expect(await chosen('tpo_nivel_hablar')).toBe('B');
    expect(await chosen('tpo_nivel_escuchar')).toBe('B');
  });

  it('does not complain about a select the edit form does not have', async () => {
    await page.setContent(EDIT_FORM);
    const report = { warnings: [] as string[] };
    await fillIdioma(page, { language: 'Italiano', level: 'Bueno' }, report);
    expect(report.warnings.join(' ')).not.toMatch(/sgl_idioma/);
  });
});
