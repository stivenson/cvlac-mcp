import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  readFormErrors,
  readFormValues,
  listRowLabels,
  findRowActionHref,
  rowActionHrefAt,
  lookupRow,
  findSimilarRows,
  normalizeActionHref,
  recordStillListed,
  labelExactCount,
  deleteItem,
  addItem,
  inferNivel,
  parsePeriod,
  inferParticipacionProy,
} from '../src/tools/update-section.js';
import { IncompleteListError } from '../src/browser/jmesa.js';

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

  // Every CvLAC page carries this link in a white-on-dark footer. Reading it as
  // a validation error made a successful update look like a rejection.
  it('ignores the footer links every CvLAC page carries', async () => {
    await page.setContent(
      '<div style="color:#fff"><a href="/politica.html">Política de seguridad de la información</a></div>'
    );
    expect(await readFormErrors(page)).toEqual([]);
  });

  it('reports the real error when the page also has that footer', async () => {
    await page.setContent(
      '<font color="red">Seleccione un programa académico</font>' +
        '<div style="color:#fff"><a href="/politica.html">Política de seguridad de la información</a></div>'
    );
    expect(await readFormErrors(page)).toEqual(['Seleccione un programa académico']);
  });

  it('does not mistake light background styling for a message', async () => {
    await page.setContent('<div style="color:#f5f5f5">Mapa del sitio</div>');
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

describe('readFormValues', () => {
  it('reads inputs, selects and textareas by name', async () => {
    await page.setContent(`
      <form>
        <input name="txt_nme_prod" value="ZZ PRUEBA MCP Curso">
        <select name="nro_ano"><option value="2024">2024</option><option value="2025" selected>2025</option></select>
        <textarea name="txt_desc">Descripción</textarea>
      </form>
    `);

    expect(await readFormValues(page)).toMatchObject({
      txt_nme_prod: 'ZZ PRUEBA MCP Curso',
      nro_ano: '2025',
      txt_desc: 'Descripción',
    });
  });

  it('reads the checked radio, not every option', async () => {
    await page.setContent(`
      <form>
        <input type="radio" name="cod_tipo" value="A">
        <input type="radio" name="cod_tipo" value="B" checked>
      </form>
    `);

    expect((await readFormValues(page)).cod_tipo).toBe('B');
  });

  it('keeps hidden fields, which is where CvLAC stores the ids that matter', async () => {
    await page.setContent('<form><input type="hidden" name="id_institucion" value="123"></form>');

    expect((await readFormValues(page)).id_institucion).toBe('123');
  });

  it('skips buttons, which carry labels rather than data', async () => {
    await page.setContent('<form><input type="submit" name="guardar" value="Guardar"></form>');

    expect(await readFormValues(page)).toEqual({});
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
      'Técnico en Gestión Agropecuaria',
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

describe('rowActionHrefAt', () => {
  it('returns the link of the row at a position among the data rows', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'lista-demas-trabajos.html'), 'utf8'));
    expect(await rowActionHrefAt(page, 1, 'Eliminar')).toContain('cod_producto=16');
    expect(await rowActionHrefAt(page, 0, 'Editar')).toContain('cod_producto=15');
  });

  it('returns null for a row that has no such link', async () => {
    await page.setContent('<table><tr class="odd"><td>1</td><td>X</td><td><a href="/q">Detalles</a></td></tr></table>');
    expect(await rowActionHrefAt(page, 0, 'Eliminar')).toBeNull();
  });
});

// lookupRow and findSimilarRows drive collectListPages/visitListPages under the
// hood, so they need a live navigation rather than page.setContent — hence the
// route mocks and the pacing env vars, same as tests/jmesa.test.ts.
describe('lookupRow and findSimilarRows across every list page', () => {
  process.env.CVLAC_MIN_REQUEST_GAP_MS = '0';
  process.env.CVLAC_REQUEST_JITTER_MS = '0';

  /** A minimal SectionConfig — lookupRow/findSimilarRows only read listUrl and matchCellIndex. */
  function guardCfg(listUrl: string) {
    return { listUrl, matchCellIndex: 1 } as unknown as Parameters<typeof lookupRow>[1];
  }

  function guardRow(n: number, title: string): string {
    return (
      `<tr class="${n % 2 ? 'odd' : 'even'}"><td>${n}</td><td>${title}</td>` +
      `<td><a href="/cvlac/EnGuard/edit.do?id=${n}">Editar</a></td>` +
      `<td><a href="/cvlac/EnGuard/confirm.do?id=${n}">Eliminar</a></td></tr>`
    );
  }

  it('lookupRow finds the one row an exact label means and its action href', async () => {
    const LIST_URL = 'https://scienti.minciencias.gov.co/cvlac/EnGuardFound/all.do';
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnGuardFound/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<table class="table" id="guard_all"><tbody>${guardRow(1, 'Item uno')}${guardRow(2, 'Item dos')}</tbody></table>`,
      })
    );
    const result = await lookupRow({ page }, guardCfg(LIST_URL), 'Item dos', 'Eliminar');
    expect(result).toEqual({ kind: 'found', href: '/cvlac/EnGuard/confirm.do?id=2', label: 'Item dos' });
  });

  it('lookupRow reports several matches instead of picking one, the neighbour risk the old lookup had', async () => {
    const LIST_URL = 'https://scienti.minciencias.gov.co/cvlac/EnGuardMany/all.do';
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnGuardMany/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body:
          `<table class="table" id="guard_all"><tbody>` +
          `${guardRow(1, 'Deep learning for crop yield')}${guardRow(2, 'Deep learning for crop yield in Colombia')}` +
          `</tbody></table>`,
      })
    );
    const result = await lookupRow({ page }, guardCfg(LIST_URL), 'Deep learning', 'Eliminar');
    expect(result).toEqual({
      kind: 'many',
      labels: ['Deep learning for crop yield', 'Deep learning for crop yield in Colombia'],
    });
  });

  it('lookupRow says none when nothing matches', async () => {
    const LIST_URL = 'https://scienti.minciencias.gov.co/cvlac/EnGuardNone/all.do';
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnGuardNone/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<table class="table" id="guard_all"><tbody>${guardRow(1, 'Otra cosa')}</tbody></table>`,
      })
    );
    const result = await lookupRow({ page }, guardCfg(LIST_URL), 'No existe', 'Eliminar');
    expect(result).toEqual({ kind: 'none' });
  });

  // A server that ignores `_mr_`/`_p_` and always answers the same first page
  // never lets the walk finish. Both lookups must throw IncompleteListError
  // here instead of reporting "not found" (update/delete would then act on the
  // wrong row, or not at all) or "no similar rows" (a repeated add would go
  // through as a duplicate CvLAC has no way to reject on its own).
  function stuckOnFirstPage(route: import('playwright').Route): Promise<void> {
    const rows = Array.from({ length: 15 }, (_, i) => guardRow(i + 1, `Item ${i + 1}`)).join('');
    return route.fulfill({
      contentType: 'text/html',
      body:
        `<table class="table" id="guard_all"><tbody>${rows}</tbody>` +
        `<tbody><tr class="statusBar"><td>Resultados 1 - 15 de 30.</td></tr></tbody></table>`,
    });
  }

  it('lookupRow throws IncompleteListError rather than "not found" when the list walk cannot finish', async () => {
    const LIST_URL = 'https://scienti.minciencias.gov.co/cvlac/EnGuardBroken/all.do';
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnGuardBroken/**', stuckOnFirstPage);
    await expect(lookupRow({ page }, guardCfg(LIST_URL), 'Item 20', 'Eliminar')).rejects.toThrow(
      IncompleteListError
    );
  });

  it('findSimilarRows — the add duplicate guard — throws rather than reporting no similar rows on the same partial read', async () => {
    const LIST_URL = 'https://scienti.minciencias.gov.co/cvlac/EnGuardBroken2/all.do';
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnGuardBroken2/**', stuckOnFirstPage);
    await expect(findSimilarRows({ page }, guardCfg(LIST_URL), 'Item 1')).rejects.toThrow(
      IncompleteListError
    );
  });
});

describe('normalizeActionHref', () => {
  it('resolves a relative and an absolute form of the same link to the same value', () => {
    expect(normalizeActionHref('/cvlac/EnFake/confirm.do?id=2')).toBe(
      normalizeActionHref('https://scienti.minciencias.gov.co/cvlac/EnFake/confirm.do?id=2')
    );
  });

  it('ignores query-parameter order', () => {
    expect(normalizeActionHref('/cvlac/EnProdTecnica/confirm.do?cod_producto=15&cod_rh=0')).toBe(
      normalizeActionHref('/cvlac/EnProdTecnica/confirm.do?cod_rh=0&cod_producto=15')
    );
  });

  it('tells two different records apart', () => {
    expect(normalizeActionHref('/cvlac/EnFake/confirm.do?id=1')).not.toBe(
      normalizeActionHref('/cvlac/EnFake/confirm.do?id=2')
    );
  });
});

// recordStillListed and labelExactCount are the identity checks that replace
// lookupRow (and its partial-match pickRow) for "is this exact record still
// there" — the bug the spec review found: a surviving near-namesake used to
// read as "still present" and fail a delete that had actually worked.
describe('recordStillListed', () => {
  process.env.CVLAC_MIN_REQUEST_GAP_MS = '0';
  process.env.CVLAC_REQUEST_JITTER_MS = '0';

  function idCfg(listUrl: string) {
    return { listUrl, matchCellIndex: 1 } as unknown as Parameters<typeof lookupRow>[1];
  }

  it('is false when only a differently-identified near-namesake remains', async () => {
    const LIST_URL = 'https://scienti.minciencias.gov.co/cvlac/EnStillA/all.do';
    // "Deep learning for crop yield" (id=1) was deleted; only its longer
    // namesake (id=2) is left.
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnStillA/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body:
          `<table class="table" id="still_all"><tbody>` +
          `<tr class="odd"><td>1</td><td>Deep learning for crop yield in Colombia</td>` +
          `<td><a href="/cvlac/EnFake/confirm.do?id=2">Eliminar</a></td></tr>` +
          `</tbody></table>`,
      })
    );
    const stillThere = await recordStillListed(
      { page },
      idCfg(LIST_URL),
      '/cvlac/EnFake/confirm.do?id=1',
      'Eliminar'
    );
    expect(stillThere).toBe(false);
  });

  it('is true when the exact same record (by href) is still listed', async () => {
    const LIST_URL = 'https://scienti.minciencias.gov.co/cvlac/EnStillB/all.do';
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnStillB/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body:
          `<table class="table" id="still_all"><tbody>` +
          `<tr class="odd"><td>1</td><td>Deep learning for crop yield</td>` +
          `<td><a href="/cvlac/EnFake/confirm.do?id=1">Eliminar</a></td></tr>` +
          `</tbody></table>`,
      })
    );
    const stillThere = await recordStillListed(
      { page },
      idCfg(LIST_URL),
      '/cvlac/EnFake/confirm.do?id=1',
      'Eliminar'
    );
    expect(stillThere).toBe(true);
  });
});

describe('labelExactCount', () => {
  process.env.CVLAC_MIN_REQUEST_GAP_MS = '0';
  process.env.CVLAC_REQUEST_JITTER_MS = '0';

  function idCfg(listUrl: string) {
    return { listUrl, matchCellIndex: 1 } as unknown as Parameters<typeof lookupRow>[1];
  }

  it('is 0 when only a partially-matching neighbour is listed', async () => {
    const LIST_URL = 'https://scienti.minciencias.gov.co/cvlac/EnCountA/all.do';
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnCountA/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body:
          '<table class="table" id="count_all"><tbody>' +
          '<tr class="odd"><td>1</td><td>Deep learning for crop yield in Colombia</td></tr>' +
          '</tbody></table>',
      })
    );
    expect(await labelExactCount({ page }, idCfg(LIST_URL), 'Deep learning for crop yield')).toBe(0);
  });

  it('counts the exact row when it is listed', async () => {
    const LIST_URL = 'https://scienti.minciencias.gov.co/cvlac/EnCountB/all.do';
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnCountB/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body:
          '<table class="table" id="count_all"><tbody>' +
          '<tr class="odd"><td>1</td><td>Deep learning for crop yield</td></tr>' +
          '</tbody></table>',
      })
    );
    expect(await labelExactCount({ page }, idCfg(LIST_URL), 'Deep learning for crop yield')).toBe(1);
  });
});

// Wiring tests for the fix itself: deleteItem's post-delete check and
// addItem's outage recovery must key off identity/exact-count, never a
// partial label match, so a near-namesake can neither hide a real delete nor
// masquerade as a save that never happened.
describe('deleteItem identifies the exact record, not a similar title', () => {
  process.env.CVLAC_MIN_REQUEST_GAP_MS = '0';
  process.env.CVLAC_REQUEST_JITTER_MS = '0';

  function cfgFor(listUrl: string) {
    return { listUrl, matchCellIndex: 1 } as unknown as Parameters<typeof deleteItem>[1];
  }

  it('reports deleted when only a longer namesake remains, not "still present"', async () => {
    const root = 'https://scienti.minciencias.gov.co/cvlac/EnDelNamesake';
    const path = new URL(root).pathname; // hrefs in real CvLAC markup are relative, not absolute
    const LIST_URL = `${root}/all.do`;
    let deleted = false;
    await page.route(`${root}/**`, (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/confirm.do')) {
        return route.fulfill({
          contentType: 'text/html',
          body: `<a href="${path}/delete.do?id=1">Borrar</a>`,
        });
      }
      if (url.pathname.endsWith('/delete.do')) {
        deleted = true;
        return route.fulfill({ contentType: 'text/html', body: 'Eliminado' });
      }
      // all.do: both rows before the delete; only the longer namesake after.
      const rows = deleted
        ? `<tr class="odd"><td>2</td><td>Deep learning for crop yield in Colombia</td>` +
          `<td><a href="${path}/confirm.do?id=2">Eliminar</a></td></tr>`
        : `<tr class="odd"><td>1</td><td>Deep learning for crop yield</td>` +
          `<td><a href="${path}/confirm.do?id=1">Eliminar</a></td></tr>` +
          `<tr class="even"><td>2</td><td>Deep learning for crop yield in Colombia</td>` +
          `<td><a href="${path}/confirm.do?id=2">Eliminar</a></td></tr>`;
      return route.fulfill({
        contentType: 'text/html',
        body: `<table class="table" id="del_all"><tbody>${rows}</tbody></table>`,
      });
    });

    const result = await deleteItem({ page }, cfgFor(LIST_URL), 'Deep learning for crop yield', true, 'demasTrabajos');
    expect(result.success).toBe(true);
    expect(result.status).toBe('ok');
    expect(result.message).toContain('Deleted');
  }, 20000);

  it('reports still present when the exact same record (by href) is still listed', async () => {
    const root = 'https://scienti.minciencias.gov.co/cvlac/EnDelStuck';
    const path = new URL(root).pathname;
    const LIST_URL = `${root}/all.do`;
    await page.route(`${root}/**`, (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/confirm.do')) {
        return route.fulfill({
          contentType: 'text/html',
          body: `<a href="${path}/delete.do?id=1">Borrar</a>`,
        });
      }
      if (url.pathname.endsWith('/delete.do')) {
        // The delete link is followed, but the row never actually leaves the list.
        return route.fulfill({ contentType: 'text/html', body: 'Eliminado' });
      }
      return route.fulfill({
        contentType: 'text/html',
        body:
          `<table class="table" id="del_all"><tbody>` +
          `<tr class="odd"><td>1</td><td>Deep learning for crop yield</td>` +
          `<td><a href="${path}/confirm.do?id=1">Eliminar</a></td></tr>` +
          `</tbody></table>`,
      });
    });

    const result = await deleteItem({ page }, cfgFor(LIST_URL), 'Deep learning for crop yield', true, 'demasTrabajos');
    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.message).toMatch(/still (present|listed)/i);
  }, 20000);
});

describe('addItem outage recovery counts the exact label, not a similar title', () => {
  process.env.CVLAC_MIN_REQUEST_GAP_MS = '0';
  process.env.CVLAC_REQUEST_JITTER_MS = '0';

  function cfgFor(root: string) {
    return {
      listUrl: `${root}/all.do`,
      matchCellIndex: 1,
      createUrl: `${root}/create.do`,
      labelOf: (d: { label: string }) => d.label,
      fill: async () => {},
    } as unknown as Parameters<typeof addItem>[1];
  }

  it('reports not created when only a neighbour is listed after the outage page', async () => {
    const root = 'https://scienti.minciencias.gov.co/cvlac/EnAddNeighbour';
    await page.route(`${root}/**`, (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/create.do')) {
        return route.fulfill({
          contentType: 'text/html',
          body: `<form method="get" action="${root}/outage.do"><button type="submit">Guardar</button></form>`,
        });
      }
      if (url.pathname.endsWith('/outage.do')) {
        return route.fulfill({ contentType: 'text/html', body: '<html><body>Server Unavailable</body></html>' });
      }
      // all.do — only the longer namesake is listed, before and after: the
      // exact title being added never actually appears.
      return route.fulfill({
        contentType: 'text/html',
        body:
          '<table class="table" id="add_all"><tbody>' +
          '<tr class="odd"><td>1</td><td>Deep learning for crop yield in Colombia</td></tr>' +
          '</tbody></table>',
      });
    });

    const result = await addItem(
      { page },
      cfgFor(root),
      { label: 'Deep learning for crop yield' },
      'Deep learning for crop yield',
      true // confirmDuplicate: skips the guard, which would otherwise block on the neighbour
    );
    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.message).toMatch(/no se cre/i);
  }, 20000);

  it('reports created when the exact row appears in the list after the outage page', async () => {
    const root = 'https://scienti.minciencias.gov.co/cvlac/EnAddExact';
    let listFetches = 0;
    await page.route(`${root}/**`, (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/create.do')) {
        return route.fulfill({
          contentType: 'text/html',
          body: `<form method="get" action="${root}/outage.do"><button type="submit">Guardar</button></form>`,
        });
      }
      if (url.pathname.endsWith('/outage.do')) {
        return route.fulfill({ contentType: 'text/html', body: '<html><body>Server Unavailable</body></html>' });
      }
      listFetches++;
      // First read (the duplicate guard, before anything is submitted) sees an
      // empty list; every read after the outage page sees the row that was,
      // in fact, saved.
      const body =
        listFetches === 1
          ? '<div>Ningún dato disponible en esta tabla</div>'
          : '<table class="table" id="add_all"><tbody>' +
            '<tr class="odd"><td>1</td><td>Deep learning for crop yield</td></tr>' +
            '</tbody></table>';
      return route.fulfill({ contentType: 'text/html', body });
    });

    const result = await addItem(
      { page },
      cfgFor(root),
      { label: 'Deep learning for crop yield' },
      'Deep learning for crop yield',
      false // guard runs, finds nothing on the (empty) list, and lets the add through
    );
    expect(result.success).toBe(true);
    expect(result.status).toBe('ok');
    expect(result.warnings?.some((w) => w.includes('Server Unavailable'))).toBe(true);
  }, 20000);

  it('reports created when CvLAC returns the empty create form after saving', async () => {
    const root = 'https://scienti.minciencias.gov.co/cvlac/EnAddFormAgain';
    let listFetches = 0;
    await page.route(`${root}/**`, (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/create.do')) {
        return route.fulfill({
          contentType: 'text/html',
          body: `<form><button type="submit">Guardar</button></form>`,
        });
      }
      listFetches++;
      const body = listFetches === 1
        ? '<div>Ningún dato disponible en esta tabla</div>'
        : '<table class="table" id="add_all"><tbody>' +
          '<tr class="odd"><td>1</td><td>Book with certificate</td></tr>' +
          '</tbody></table>';
      return route.fulfill({ contentType: 'text/html', body });
    });

    const result = await addItem(
      { page },
      cfgFor(root),
      { label: 'Book with certificate' },
      'Book with certificate',
      true
    );
    expect(result.success).toBe(true);
    expect(result.status).toBe('ok');
    expect(result.warnings?.some((w) => w.includes('fila exacta'))).toBe(true);
  }, 20000);
});
