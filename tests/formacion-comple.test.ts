import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { inferNivelComple, findRowActionHref } from '../src/tools/update-section.js';

// Formación complementaria runs on the same module as formación académica, but
// its cod_nivel_formacion catalogue is a different one: Y Otros, 8 Extensión,
// F Cursos de corta duración, E MBA. Feeding it a TE code (1 Pregrado, 3
// Maestría…) sends a value this form does not offer.
describe('inferNivelComple', () => {
  it.each([
    ['Diplomado en Desarrollo de aplicaciones móviles', '8'],
    ['Curso de extensión en Estadística', '8'],
    ['Curso de corta duración en Soldadura', 'F'],
    ['Taller de programación web', 'F'],
    ['Seminario de actualización docente', 'F'],
    ['MBA', 'E'],
    ['Master of Business Administration', 'E'],
  ])('maps %s to level %s', (name, expected) => {
    expect(inferNivelComple(name)).toBe(expected);
  });

  it('ignores case and accents', () => {
    expect(inferNivelComple('DIPLOMADO EN IA')).toBe('8');
    expect(inferNivelComple('curso de extension')).toBe('8');
  });

  // "Otros" is CvLAC's own catch-all, not a value this server made up.
  it('falls back to CvLAC own "Otros" rather than to a TE code', () => {
    expect(inferNivelComple('Programa de mentoría')).toBe('Y');
    expect(inferNivelComple('')).toBe('Y');
  });

  // The codes of formación académica must never come out of here.
  it('never returns a level from the other catalogue', () => {
    for (const name of ['Maestría en Ciencia de Datos', 'Doctorado en Física', 'Ingeniería de Sistemas']) {
      expect(['Y', '8', 'F', 'E']).toContain(inferNivelComple(name));
    }
  });
});

// One real row of formación complementaria has Detalles and Editar but no
// Eliminar: CvLAC blocks deleting some records. Looking only for the Eliminar
// link then reported "no item matching X", which is false — the item is there
// and simply cannot be removed.
describe('a row CvLAC refuses to let go', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
  }, 60000);

  afterAll(async () => {
    await browser?.close();
  });

  const LIST = `<table>
    <tr class="odd">
      <td>1</td><td>2014</td><td>Extensión</td><td>2014</td><td>UNIVERSIDAD X</td><td>Diplomado en IA</td>
      <td><a href="/cvlac/EnTrayectoriaEscolar/query.do?cod_tray_escolar=16">Detalles</a></td>
      <td><a href="/cvlac/EnTrayectoriaEscolar/edit.do?cod_tray_escolar=16">Editar</a></td>
      <td></td>
    </tr>
    <tr class="even">
      <td>2</td><td>2008</td><td>Cursos</td><td>2008</td><td>SENA</td><td>Instalación de software</td>
      <td><a href="/cvlac/EnTrayectoriaEscolar/query.do?cod_tray_escolar=4">Detalles</a></td>
      <td><a href="/cvlac/EnTrayectoriaEscolar/edit.do?cod_tray_escolar=4">Editar</a></td>
      <td><a href="/cvlac/EnTrayectoriaEscolar/confirm.do?cod_tray_escolar=4">Eliminar</a></td>
    </tr>
  </table>`;

  it('finds no delete link for the blocked row', async () => {
    await page.setContent(LIST);
    expect(await findRowActionHref(page, 5, 'Diplomado en IA', 'Eliminar')).toBeNull();
  });

  it('still finds the row itself, which is what tells the two cases apart', async () => {
    await page.setContent(LIST);
    expect(await findRowActionHref(page, 5, 'Diplomado en IA', 'Detalles')).toContain('cod_tray_escolar=16');
  });

  it('deletes the row that does carry the link', async () => {
    await page.setContent(LIST);
    expect(await findRowActionHref(page, 5, 'Instalación de software', 'Eliminar')).toContain(
      'cod_tray_escolar=4'
    );
  });
});
