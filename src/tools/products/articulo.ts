import type { Page } from 'playwright';
import type { ArticleInput } from '../../types.js';
import { SECTION_LIST, URLS } from '../../browser/navigation.js';
import { loadConfig } from '../../config.js';
import {
  humanDelay,
  missingValue,
  setMunicipio,
  tryField,
  type FillReport,
  type SectionConfig,
} from '../form-kit.js';
import { setRevista, type CatalogueSearch } from '../pickers.js';
import { articuloTipo, medioPublicacion } from './codes.js';

export const articuloLabel = (item: ArticleInput): string => item.title.trim();

export const bareDoi = (doi: string): string =>
  doi.trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '');

export async function fillArticulo(
  page: Page,
  item: ArticleInput,
  report: FillReport,
  deps: { search?: CatalogueSearch } = {}
): Promise<void> {
  const defaults = loadConfig().defaults ?? {};
  const tipo = item.tipo ? articuloTipo(item.tipo) : '111';
  if (tipo) {
    await tryField(report, 'cod_tipo_producto', () => page.check(`input[name="cod_tipo_producto"][value="${tipo}"]`));
  } else {
    (report.blockers ??= []).push(`cod_tipo_producto: "${item.tipo}" no es completo, corto, revisión ni caso clínico`);
  }

  await tryField(report, 'txt_nme_prod', () => page.fill('input:not([type="hidden"])[name="txt_nme_prod"]', item.title));
  await tryField(report, 'nro_ano_presenta', () => page.selectOption('select[name="nro_ano_presenta"]', item.year));
  if (item.month) {
    await tryField(report, 'nro_mes_presenta', () => page.selectOption('select[name="nro_mes_presenta"]', String(parseInt(item.month!, 10))));
  } else {
    report.warnings.push('nro_mes_presenta: el ítem no trae "month"; CvLAC guarda Enero');
  }
  await humanDelay(200, 400);

  await setRevista(page, report, { issn: item.issn, name: item.revista, revistaId: item.revistaId }, deps.search);

  const fields: Array<[string, string | undefined]> = [
    ['txt_volumen_revista', item.volumen],
    ['txt_fasciculo_revista', item.fasciculo],
    ['txt_serie_revista', item.serie],
    ['txt_pagina_inicial', item.paginaInicial],
    ['txt_pagina_final', item.paginaFinal],
    ['txt_web_producto', item.url],
    ['txt_doi', item.doi ? bareDoi(item.doi) : undefined],
  ];
  for (const [field, value] of fields) {
    if (value) await tryField(report, field, () => page.fill(`input:not([type="hidden"])[name="${field}"]`, value));
  }

  const idioma = item.idioma ?? defaults.idioma;
  if (idioma) await tryField(report, 'sgl_idioma', () => page.selectOption('select[name="sgl_idioma"]', idioma.toUpperCase()));
  else missingValue(report, 'sgl_idioma', 'define defaults.idioma en cvlac.config.json');

  if (item.medio) {
    const medio = medioPublicacion(item.medio);
    if (medio) await tryField(report, 'tpo_medio_divulgacion', () => page.selectOption('select[name="tpo_medio_divulgacion"]', medio));
    else missingValue(report, 'tpo_medio_divulgacion', `"${item.medio}" no es papel ni electrónico`);
  }

  const ciudad = item.ciudad ?? defaults.municipio?.nombre;
  if (ciudad && (await page.$('input[name="cod_municipio_text"]'))) {
    await setMunicipio(page, report, ciudad, defaults.municipio?.codigoDane);
  }
  await humanDelay(200, 300);
}

export const articulosSection: SectionConfig = {
  ...SECTION_LIST.articulos,
  createUrl: URLS.articulosCreate,
  labelOf: articuloLabel,
  fill: (page, data, report) => fillArticulo(page, data as ArticleInput, report),
};
