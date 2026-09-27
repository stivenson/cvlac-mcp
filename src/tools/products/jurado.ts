import type { Page } from 'playwright';
import type { JuryInput } from '../../types.js';
import { SECTION_LIST, URLS } from '../../browser/navigation.js';
import { loadConfig } from '../../config.js';
import { countryOption } from '../../browser/catalogue.js';
import { humanDelay, missingValue, setInstitucionFields, tryField, type FillReport, type SectionConfig } from '../form-kit.js';
import { setProgramaInstitucion, type CatalogueSearch } from '../pickers.js';
import { bareDoi } from './articulo.js';
import { juradoNivel, juradoTrabajo } from './codes.js';

const FORM = 'enTesisOrientadaInsertForm';

export async function fillJurado(page: Page, item: JuryInput, report: FillReport, deps: { search?: CatalogueSearch } = {}): Promise<void> {
  const defaults = loadConfig().defaults ?? {};
  const nivel = juradoNivel(item.nivel);
  if (nivel) await tryField(report, 'cod_tipo_producto', () => page.selectOption('select[name="cod_tipo_producto"]', nivel));
  else (report.blockers ??= []).push(`cod_tipo_producto: "${item.nivel}" no es un nivel de jurado conocido`);

  const trabajo = item.tipoTrabajo ? juradoTrabajo(item.tipoTrabajo) : 'TG';
  if (trabajo) await tryField(report, 'tpo_trab_pres', () => page.selectOption('select[name="tpo_trab_pres"]', trabajo));
  else missingValue(report, 'tpo_trab_pres', `"${item.tipoTrabajo}" no es proyecto, trabajo de grado ni examen`);

  await tryField(report, 'txt_nme_prod', () => page.fill('input:not([type="hidden"])[name="txt_nme_prod"]', item.title));
  await tryField(report, 'nro_ano_presenta', () => page.selectOption('select[name="nro_ano_presenta"]', item.year));
  if (item.month) await tryField(report, 'nro_mes_presenta', () => page.selectOption('select[name="nro_mes_presenta"]', String(parseInt(item.month!, 10))));
  else report.warnings.push('nro_mes_presenta: el ítem no trae "month"; CvLAC guarda Enero');
  await tryField(report, 'txt_nme_orientados', () => page.fill('input[name="txt_nme_orientados"]', item.orientado));

  const idioma = item.idioma ?? defaults.idioma;
  if (idioma) await tryField(report, 'sgl_idioma', () => page.selectOption('select[name="sgl_idioma"]', idioma.toUpperCase()));
  const pais = countryOption(item.pais ?? defaults.pais ?? 'CO');
  if (pais) await tryField(report, 'sgl_pais', () => page.selectOption('select[name="sgl_pais"]', pais));
  if (item.medio) {
    const medio = /internet|web|online|electr|digital/i.test(item.medio) ? 'H' : /papel|impres/i.test(item.medio) ? 'I' : /otro/i.test(item.medio) ? 'O' : null;
    if (medio) await tryField(report, 'tpo_medio_divulgacion', () => page.selectOption('select[name="tpo_medio_divulgacion"]', medio));
    else missingValue(report, 'tpo_medio_divulgacion', `"${item.medio}" no es papel, internet ni otro`);
  }
  if (item.url) await tryField(report, 'txt_web_producto', () => page.fill('input[name="txt_web_producto"]', item.url!));
  if (item.doi) await tryField(report, 'txt_doi', () => page.fill('input[name="txt_doi"]', bareDoi(item.doi!)));

  await setInstitucionFields(page, report, item.institucion, 'id_institucion', 'txt_nme_institucion', item.institucionId);
  if (report.choices?.length) return;
  await setProgramaInstitucion(page, report, {
    form: FORM,
    textField: 'txt_nme_programa_acad',
    institucionField: 'id_institucion',
    degree: item.programa,
    programaId: item.programaId,
  }, deps.search);
  await humanDelay(200, 300);
}

export const juradosSection: SectionConfig = {
  ...SECTION_LIST.jurados,
  createUrl: URLS.juradosCreate,
  labelOf: (item: JuryInput) => item.title.trim(),
  fill: (page, data, report) => fillJurado(page, data as JuryInput, report),
};
