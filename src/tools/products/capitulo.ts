import type { Page } from 'playwright';
import type { ChapterInput } from '../../types.js';
import type { CatalogueArea } from '../areas.js';
import { SECTION_LIST, URLS } from '../../browser/navigation.js';
import { countryOption } from '../../browser/catalogue.js';
import { humanDelay, missingValue, tryField, type FillReport, type SectionConfig } from '../form-kit.js';
import { setLibroRef, setProductArea, type CatalogueSearch } from '../pickers.js';
import { bareDoi } from './articulo.js';
import { medioPublicacion } from './codes.js';

export async function fillCapitulo(page: Page, item: ChapterInput, report: FillReport, deps: { search?: CatalogueSearch; areas?: (page: Page) => Promise<CatalogueArea[]> } = {}): Promise<void> {
  await tryField(report, 'txt_nme_prod', () => page.fill('input:not([type="hidden"])[name="txt_nme_prod"]', item.title));
  await tryField(report, 'nro_ano_presenta', () => page.selectOption('select[name="nro_ano_presenta"]', item.year));
  if (item.month) await tryField(report, 'nro_mes_presenta', () => page.selectOption('select[name="nro_mes_presenta"]', String(parseInt(item.month!, 10))));
  else (report.blockers ??= []).push('nro_mes_presenta: el formulario de capítulo exige el mes y el ítem no lo trae');

  const fields: Array<[string, string | undefined]> = [
    ['txt_pagina_inicial', item.paginaInicial], ['txt_pagina_final', item.paginaFinal], ['nro_paginas', item.paginas],
    ['txt_serie', item.serie], ['txt_edicion', item.edicion], ['txt_doi', item.doi ? bareDoi(item.doi) : undefined],
  ];
  for (const [field, value] of fields) if (value) await tryField(report, field, () => page.fill(`input[name="${field}"]`, value));

  const pais = countryOption(item.pais ?? 'CO');
  if (pais) await tryField(report, 'sgl_pais', () => page.selectOption('select[name="sgl_pais"]', pais));
  if (item.medio) {
    const medio = medioPublicacion(item.medio);
    if (medio) await tryField(report, 'tpo_medio_divulgacion', () => page.selectOption('select[name="tpo_medio_divulgacion"]', medio));
    else missingValue(report, 'tpo_medio_divulgacion', `"${item.medio}" no es papel ni electrónico`);
  }
  await setLibroRef(page, report, { title: item.bookTitle, isbn: item.isbn, libroId: item.libroId }, deps.search);
  await setProductArea(page, report, item.area, item.areaId, deps.areas);
  await humanDelay(200, 300);
}

export const capitulosSection: SectionConfig = {
  ...SECTION_LIST.capitulos,
  createUrl: URLS.capitulosCreate,
  labelOf: (item: ChapterInput) => item.title.trim(),
  fill: (page, data, report) => fillCapitulo(page, data as ChapterInput, report),
};
