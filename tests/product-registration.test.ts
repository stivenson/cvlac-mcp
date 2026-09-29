import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fillJurado } from '../src/tools/products/jurado.js';
import { fillTesis } from '../src/tools/products/tesis.js';
import { fillCapitulo } from '../src/tools/products/capitulo.js';
import { fillLibro, MAX_CERTIFICATE_BYTES, validateCertificateFile } from '../src/tools/products/libro.js';
import { fillTecnica, TECNICA_KINDS } from '../src/tools/products/tecnica.js';

vi.setConfig({ testTimeout: 20000 });

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage();
  page.setDefaultTimeout(500);
}, 60000);

afterAll(async () => {
  await browser?.close();
});

const report = () => ({ warnings: [] as string[] });
const search = async (path: string): Promise<string> => {
  if (path.includes('queryPrograma')) return `<option value="603-77">PROGRAMA DE PRUEBA</option>`;
  if (path.includes('queryLibro')) return `<option value="0000000000#443">Libro de prueba</option>`;
  if (path.includes('queryEditorial')) return `<option value="ED5773">Editorial de prueba</option>`;
  return '';
};

describe('registro de productos CvLAC', () => {
  it('validates certificate paths as readable PDFs under CvLAC’s 2 MiB limit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cvlac-certificate-test-'));
    try {
      const valid = join(dir, 'certificate.pdf');
      writeFileSync(valid, '%PDF-1.4\n% test');
      expect(validateCertificateFile(valid)).toMatchObject({ ok: true, path: valid });

      const wrongExtension = join(dir, 'certificate.txt');
      writeFileSync(wrongExtension, '%PDF-1.4\n% test');
      expect(validateCertificateFile(wrongExtension)).toMatchObject({ ok: false });

      const tooLarge = join(dir, 'large.pdf');
      writeFileSync(tooLarge, Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(MAX_CERTIFICATE_BYTES)]));
      expect(validateCertificateFile(tooLarge)).toMatchObject({ ok: false, message: 'supera el límite de 2 MiB' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('llena un jurado y resuelve institución y programa', async () => {
    await page.setContent(`<form>
      <select name="cod_tipo_producto"><option value="A15">Jurado</option></select>
      <input name="txt_nme_prod"><select name="nro_ano_presenta"><option value="2024">2024</option></select>
      <select name="nro_mes_presenta"><option value="3">Marzo</option></select><input name="txt_nme_orientados">
      <select name="sgl_idioma"><option value="ES">Español</option></select><select name="sgl_pais"><option value="COL">Colombia</option></select>
      <input id="id_institucion" name="id_institucion"><input id="txt_nme_institucion" name="txt_nme_institucion">
      <input name="txt_nme_programa_acad"><input name="cod_rh_programa_academico">
      <input name="txt_web_producto"><input name="txt_doi"><select name="tpo_medio_divulgacion"><option value="H">Internet</option></select>
    </form>`);
    const r = report();
    await fillJurado(page, {
      title: 'Jurado de prueba', nivel: 'pregrado', tipoTrabajo: 'trabajo de grado', year: '2024', month: '3', orientado: 'Ana',
      institucion: 'Universidad de prueba', institucionId: '603', programa: 'Programa de prueba', idioma: 'es', pais: 'CO',
      medio: 'internet', url: 'https://example.org', doi: 'https://doi.org/10.1/jurado',
    }, r, { search });
    expect(r.blockers ?? []).toEqual([]);
    expect(await page.locator('[name="id_institucion"]').inputValue()).toBe('603');
    expect(await page.locator('[name="cod_rh_programa_academico"]').inputValue()).toBe('603-77');
    expect(await page.locator('[name="txt_doi"]').inputValue()).toBe('10.1/jurado');
  });

  it('llena tesis y solo aplica valoración cuando hay fecha final', async () => {
    await page.setContent(`<form>
      <input type="radio" name="cod_tipo_producto" value="62"><select name="tpo_orientacion"><option value="O">Orientador</option></select>
      <input name="txt_nme_prod"><select name="nro_ano_presenta"><option value="2023">2023</option></select>
      <select name="nro_mes_presenta"><option value="6">Junio</option></select><select name="nro_ano_fin"><option value="2024">2024</option></select>
      <select name="nro_mes_fin"><option value="7">Julio</option></select><input name="nro_paginas">
      <input id="id_institucion" name="id_institucion"><input id="nme_inst" name="nme_inst"><input name="nme_programa_academico"><input name="cod_rh_programa_academico">
      <select name="valoracion_obt_tesis"><option value="7">Laureada</option></select>
    </form>`);
    const r = report();
    await fillTesis(page, {
      title: 'Tesis de prueba', tipo: 'maestría', rol: 'orientador', year: '2023', month: '6', yearEnd: '2024', monthEnd: '7',
      paginas: '120', institucion: 'Universidad de prueba', institucionId: '603', programa: 'Programa de prueba', valoracion: 'laureada',
    }, r, { search });
    expect(r.blockers ?? []).toEqual([]);
    expect(await page.locator('[name="valoracion_obt_tesis"]').inputValue()).toBe('7');
    expect(await page.locator('[name="nme_programa_academico"]').inputValue()).toBe('PROGRAMA DE PRUEBA');
  });

  it('llena capítulo y libro con los pickers inyectados', async () => {
    await page.setContent(`<form>
      <input name="txt_nme_prod"><select name="nro_ano_presenta"><option value="2024">2024</option></select><select name="nro_mes_presenta"><option value="8">Agosto</option></select>
      <input name="txt_pagina_inicial"><input name="txt_pagina_final"><input name="nro_paginas"><input name="txt_doi"><select name="sgl_pais"><option value="COL">Colombia</option></select>
      <select name="tpo_medio_divulgacion"><option value="H">Internet</option></select><input name="txt_nme_libro"><input name="cod_libro_ref"><input name="null">
      <input name="cod_area_conocimiento"><input name="nombre_area">
    </form>`);
    const r = report();
    await fillCapitulo(page, {
      title: 'Capítulo de prueba', bookTitle: 'Libro de prueba', year: '2024', month: '8', paginaInicial: '1', paginaFinal: '20',
      paginas: '20', doi: 'doi:10.1/capitulo', medio: 'electrónico', area: 'Sistemas',
    }, r, { search, areas: async () => [{ code: '2B02', name: 'Sistemas', parent: '2B', level: 2 }] });
    expect(r.blockers ?? []).toEqual([]);
    expect(await page.locator('[name="cod_libro_ref"]').inputValue()).toBe('443');
    expect(await page.locator('[name="cod_area_conocimiento"]').inputValue()).toBe('2B02');
  });

  it('llena libro normalizando ISBN, editorial y área', async () => {
    await page.setContent(`<form>
      <input name="txt_nme_prod"><input name="txt_isbn"><select name="nro_ano_presenta"><option value="2024">2024</option></select><select name="nro_mes_presenta"><option value="9">Septiembre</option></select>
      <input type="radio" name="tpo_publicacion" value="ED"><select name="sgl_pais"><option value="COL">Colombia</option></select><select name="tpo_medio_divulgacion"><option value="I">Papel</option></select>
      <input id="txt_nme_editorial1" name="txt_nme_editorial"><input name="cod_editorial"><input name="null"><input name="cod_area_conocimiento"><input name="nombre_area">
    </form>`);
    const r = report();
    await fillLibro(page, {
      title: 'Libro de prueba', isbn: '978-958-12-3456-7', year: '2024', month: '9', editorial: 'Editorial de prueba',
      publicacion: 'nacional', medio: 'papel', area: 'Sistemas',
    }, r, { search, areas: async () => [{ code: '2B02', name: 'Sistemas', parent: '2B', level: 2 }] });
    expect(r.blockers ?? []).toEqual([]);
    expect(await page.locator('[name="txt_isbn"]').inputValue()).toBe('9789581234567');
    expect(await page.locator('[name="cod_editorial"]').inputValue()).toBe('5773');
  });

  it('llena los campos comunes de una sección técnica', async () => {
    await page.setContent(`<form>
      <input type="radio" name="cod_tipo_producto" value="226"><input name="txt_nme_prod"><select name="nro_ano_presenta"><option value="2024">2024</option></select>
      <select name="nro_mes_presenta"><option value="10">Octubre</option></select><select name="txt_disponibilidad"><option value="No restringido">No restringido</option></select>
      <select name="sgl_idioma"><option value="ES">Español</option></select><input name="txt_nme_comercial"><input name="tpo_prod_tiene" type="radio" value="N">
      <input name="id_institucion"><input name="nme_inst">
    </form>`);
    const r = report();
    await fillTecnica(TECNICA_KINDS.productosTecnologicos, page, {
      title: 'Producto tecnológico', tipo: 'base de datos', year: '2024', month: '10', disponibilidad: 'no restringido',
      nombreComercial: 'Producto X', institucion: 'Universidad de prueba', institucionId: '603',
    }, r);
    expect(r.blockers ?? []).toEqual([]);
    expect(await page.locator('[name="txt_nme_comercial"]').inputValue()).toBe('Producto X');
    expect(await page.locator('[name="tpo_prod_tiene"]').isChecked()).toBe(true);
  });
});
