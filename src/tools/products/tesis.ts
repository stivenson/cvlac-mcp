import type { Page } from 'playwright';
import type { ThesisInput } from '../../types.js';
import { SECTION_LIST, URLS } from '../../browser/navigation.js';
import { humanDelay, setInstitucionFields, tryField, type FillReport, type SectionConfig } from '../form-kit.js';
import { setProgramaInstitucion, type CatalogueSearch } from '../pickers.js';
import { tesisRol, tesisTipo, tesisValoracion } from './codes.js';

const FORM = 'enTesisOrientadaInsertForm';

export async function fillTesis(page: Page, item: ThesisInput, report: FillReport, deps: { search?: CatalogueSearch } = {}): Promise<void> {
  const tipo = tesisTipo(item.tipo);
  if (tipo) await tryField(report, 'cod_tipo_producto', () => page.check(`input[name="cod_tipo_producto"][value="${tipo}"]`));
  else (report.blockers ??= []).push(`cod_tipo_producto: "${item.tipo}" no es un tipo de tesis conocido`);
  const rol = item.rol ? tesisRol(item.rol) : 'O';
  if (rol) await tryField(report, 'tpo_orientacion', () => page.selectOption('select[name="tpo_orientacion"]', rol));
  else report.warnings.push(`tpo_orientacion: "${item.rol}" no se reconoce; no se seleccionó`);

  await tryField(report, 'txt_nme_prod', () => page.fill('input:not([type="hidden"])[name="txt_nme_prod"]', item.title));
  await tryField(report, 'nro_ano_presenta', () => page.selectOption('select[name="nro_ano_presenta"]', item.year));
  if (item.month) await tryField(report, 'nro_mes_presenta', () => page.selectOption('select[name="nro_mes_presenta"]', String(parseInt(item.month!, 10))));
  if (item.yearEnd) {
    await tryField(report, 'nro_ano_fin', () => page.selectOption('select[name="nro_ano_fin"]', item.yearEnd!));
    if (item.monthEnd) await tryField(report, 'nro_mes_fin', () => page.selectOption('select[name="nro_mes_fin"]', String(parseInt(item.monthEnd!, 10))));
  }
  if (item.paginas) await tryField(report, 'nro_paginas', () => page.fill('input[name="nro_paginas"]', item.paginas!));

  await setInstitucionFields(page, report, item.institucion, 'id_institucion', 'nme_inst', item.institucionId);
  if (!report.choices?.length) {
    await setProgramaInstitucion(page, report, {
      form: FORM,
      textField: 'nme_programa_academico',
      institucionField: 'id_institucion',
      degree: item.programa,
      programaId: item.programaId,
    }, deps.search);
  }

  if (item.valoracion) {
    const value = tesisValoracion(item.valoracion);
    if (!item.yearEnd || !item.monthEnd) {
      report.warnings.push('valoracion_obt_tesis: no se escribió porque la tesis no tiene fecha de finalización');
    } else if (value) {
      await tryField(report, 'valoracion_obt_tesis', async () => {
        await page.selectOption('select[name="valoracion_obt_tesis"]', value);
        await page.dispatchEvent('select[name="valoracion_obt_tesis"]', 'change');
      });
    } else {
      report.warnings.push(`valoracion_obt_tesis: "${item.valoracion}" no es aprobada, meritoria ni laureada`);
    }
  }
  if (item.estudiantes?.length) report.warnings.push('txt_personas: vincular estudiantes requiere sus perfiles CvLAC y se hace desde la web');
  await humanDelay(200, 300);
}

export const tesisSection: SectionConfig = {
  ...SECTION_LIST.tesis,
  createUrl: URLS.tesisCreate,
  labelOf: (item: ThesisInput) => item.title.trim(),
  fill: (page, data, report) => fillTesis(page, data as ThesisInput, report),
};
