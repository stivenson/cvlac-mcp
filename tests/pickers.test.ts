import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import {
  applyEditorial,
  applyLibro,
  applyPrograma,
  applyRevista,
  parseEditorialOptions,
  parseLibroOptions,
  parseRevistaOptions,
  normalizeIssn,
  pickRevista,
  productAreaLabel,
  resolveProductArea,
  programaSearchPath,
} from '../src/tools/pickers.js';
import type { CatalogueArea } from '../src/tools/areas.js';

const REVISTAS = `
<select name="select" size="10">
<option value='0000000000102719'> (22488723) INGENIERIA E INVESTIGACION </option>
<option value='00000000005518'> (01205609) INGENIERIA E INVESTIGACION </option>
<option value='1234567890000777'> CV- Revista registrada por otro investigador </option>
</select>`;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage();
}, 60000);

afterAll(async () => {
  await browser?.close();
});

describe('journal parsing and selection', () => {
  it('splits catalogue journals from researcher-registered ones', () => {
    expect(parseRevistaOptions(REVISTAS)).toEqual([
      { value: '0000000000102719', issn: '2248-8723', name: 'INGENIERIA E INVESTIGACION', kind: 'catalogo' },
      { value: '00000000005518', issn: '0120-5609', name: 'INGENIERIA E INVESTIGACION', kind: 'catalogo' },
      { value: '1234567890000777', issn: null, name: 'Revista registrada por otro investigador', kind: 'otra' },
    ]);
  });

  it('normalizes and rejects ISSNs', () => {
    expect(normalizeIssn('01205609')).toBe('0120-5609');
    expect(normalizeIssn('1234-567x')).toBe('1234-567X');
    expect(normalizeIssn('12345')).toBeNull();
  });

  it('uses ISSN to resolve homonymous journals and asks by name', () => {
    const options = parseRevistaOptions(REVISTAS);
    expect(pickRevista(options, { issn: '0120-5609', name: 'Ingeniería e Investigación' })).toEqual({ kind: 'exact', item: options[1] });
    expect(pickRevista(options, { name: 'Ingeniería e Investigación' }).kind).toBe('ambiguous');
    expect(pickRevista(options, { issn: '9999-9999' })).toEqual({ kind: 'none' });
  });
});

describe('book and publisher parsing', () => {
  it('reads book owner and product codes', () => {
    expect(parseLibroOptions(`<option value='0000000000#443'>Libro de referencia</option><option value='0000012345#98'>-Libro de otro</option>`)).toEqual([
      { value: '0000000000#443', codRh: '0000000000', codProducto: '443', label: 'Libro de referencia', kind: 'referencia' },
      { value: '0000012345#98', codRh: '0000012345', codProducto: '98', label: 'Libro de otro', kind: 'otro' },
    ]);
  });

  it('reads catalogue and researcher publishers', () => {
    expect(parseEditorialOptions(`<option value='ED5773'>Ediciones X</option><option value='CV120'>Editorial registrada</option>`)).toEqual([
      { value: 'ED5773', code: '5773', label: 'Ediciones X', kind: 'catalogo' },
      { value: 'CV120', code: '120', label: 'Editorial registrada', kind: 'otra' },
    ]);
  });
});

describe('picker writes', () => {
  it('writes a journal, clearing the alternative code', async () => {
    await page.setContent(`<form><input name="txt_nme_revista" readonly><input name="cod_revista"><input name="cod_revista_otro" value="x"><input name="tpo_revista"></form>`);
    await (await import('../src/tools/pickers.js')).applyRevista(page, { value: '00000000005518', issn: '0120-5609', name: 'INGENIERIA E INVESTIGACION', kind: 'catalogo' });
    expect(await page.$$eval('input', (els) => els.map((e) => (e as HTMLInputElement).value))).toEqual(['(01205609) INGENIERIA E INVESTIGACION', '5518', '', 'PD']);
  });

  it('writes a reference book and refuses duplicate null fields', async () => {
    await page.setContent(`<form><input name="txt_nme_libro"><input name="cod_libro_ref"><input name="null" value="9"></form>`);
    await applyLibro(page, { value: '0000000000#443', codRh: '0000000000', codProducto: '443', label: 'Libro X', kind: 'referencia' });
    expect(await page.$$eval('input', (els) => els.map((e) => (e as HTMLInputElement).value))).toEqual(['Libro X', '443', '']);
    await page.setContent(`<form><input name="txt_nme_libro"><input name="cod_libro_ref"><input name="null"><input name="null"></form>`);
    await expect(applyLibro(page, { value: '1#2', codRh: '1', codProducto: '2', label: 'Y', kind: 'otro' })).rejects.toThrow(/null/);
  });

  it('writes publisher and programme fields', async () => {
    await page.setContent(`<form><input id="txt_nme_editorial1" name="txt_nme_editorial"><input name="cod_editorial"><input name="null"><input name="nme_programa_academico"><input name="cod_rh_programa_academico"></form>`);
    await applyEditorial(page, { value: 'ED5773', code: '5773', label: 'Ediciones X', kind: 'catalogo' });
    await applyPrograma(page, 'nme_programa_academico', { value: '0000000000-21873', label: 'ADMINISTRACION' });
    expect(await page.$$eval('input', (els) => els.map((e) => (e as HTMLInputElement).value))).toContain('5773');
    expect(await page.locator('[name="cod_rh_programa_academico"]').inputValue()).toBe('0000000000-21873');
  });
});

describe('programme path and product areas', () => {
  it('builds the programme search path', () => {
    const path = programaSearchPath({ form: 'enTesisOrientadaInsertForm', textField: 'nme_programa_academico', institucionId: '603' });
    const url = new URL(`https://x${path}`);
    expect(url.pathname).toBe('/cvlac/EnProgramaAcademico/queryPrograma.do');
    expect(url.searchParams.get('__form')).toBe('enTesisOrientadaInsertForm');
    expect(url.searchParams.get('__value')).toBe('cod_rh_programa_academico');
    expect(url.searchParams.get('id_institucion')).toBe('603');
  });

  const catalogue: CatalogueArea[] = [
    { code: '2', name: 'Ingeniería y Tecnología', parent: null, level: 0 },
    { code: '2B', name: 'Ingenierías Eléctrica, Electrónica e Informática', parent: '2', level: 1 },
    { code: '2B02', name: 'Ingeniería de Sistemas y Comunicaciones', parent: '2B', level: 2 },
    { code: '2B0201', name: 'Ingeniería de software', parent: '2B02', level: 3 },
  ];

  it('formats and resolves a product area', () => {
    expect(productAreaLabel(catalogue, catalogue[3])).toBe('Ingeniería y Tecnología - Ingenierías Eléctrica, Electrónica e Informática - Ingeniería de software');
    expect(resolveProductArea(catalogue, '2B02')).toEqual({ kind: 'exact', item: catalogue[2] });
    expect(resolveProductArea(catalogue, 'ingenieria de software')).toEqual({ kind: 'exact', item: catalogue[3] });
    expect(resolveProductArea(catalogue, 'Ingeniería y Tecnología')).toEqual({ kind: 'none' });
  });
});
