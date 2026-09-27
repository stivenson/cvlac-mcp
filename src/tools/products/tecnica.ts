import type { Page } from 'playwright';
import type { CvLACSectionName, TechnicalInput } from '../../types.js';
import { SECTION_LIST, URLS } from '../../browser/navigation.js';
import { loadConfig } from '../../config.js';
import { forceSetReadonlyByName, humanDelay, missingValue, setInstitucionFields, setMunicipio, tryField, type FillReport, type SectionConfig } from '../form-kit.js';
import { consultoriaTipo, disponibilidad, productoTecnologicoTipo, prototipoTipo } from './codes.js';

export interface TecnicaKind {
  section: CvLACSectionName;
  createUrl: string;
  tipo: ((text: string) => string | null) | null;
  institucion: { idField: string; nmeField: string } | null;
  extras: Array<{ key: keyof TechnicalInput; field: string }>;
  hasIdioma: boolean;
  hasEnd: boolean;
}

const INST = { idField: 'id_institucion', nmeField: 'nme_inst' };

export const TECNICA_KINDS: Record<string, TecnicaKind> = {
  informesTecnicos: {
    section: 'informesTecnicos', createUrl: URLS.informesTecnicosCreate, tipo: null, institucion: INST,
    extras: [{ key: 'paginas', field: 'nro_paginas' }, { key: 'contrato', field: 'txt_contrato_reg' }], hasIdioma: true, hasEnd: false,
  },
  innovacionesProceso: {
    section: 'innovacionesProceso', createUrl: URLS.innovacionesProcesoCreate, tipo: null, institucion: INST,
    extras: [{ key: 'valorContrato', field: 'nro_vlr_contrato' }], hasIdioma: false, hasEnd: false,
  },
  productosTecnologicos: {
    section: 'productosTecnologicos', createUrl: URLS.productosTecnologicosCreate, tipo: productoTecnologicoTipo, institucion: INST,
    extras: [{ key: 'nombreComercial', field: 'txt_nme_comercial' }], hasIdioma: false, hasEnd: false,
  },
  consultorias: {
    section: 'consultorias', createUrl: URLS.consultoriasCreate, tipo: consultoriaTipo, institucion: INST,
    extras: [{ key: 'duracion', field: 'nro_duracion' }, { key: 'contrato', field: 'txt_contrato_reg' }], hasIdioma: true, hasEnd: true,
  },
  prototipos: {
    section: 'prototipos', createUrl: URLS.prototiposCreate, tipo: prototipoTipo, institucion: null,
    extras: [], hasIdioma: false, hasEnd: false,
  },
};

const month = (value: string): string => String(parseInt(value, 10));

export async function fillTecnica(kind: TecnicaKind, page: Page, item: TechnicalInput, report: FillReport): Promise<void> {
  const defaults = loadConfig().defaults ?? {};
  if (kind.tipo) {
    const code = item.tipo ? kind.tipo(item.tipo) : null;
    if (code) await tryField(report, 'cod_tipo_producto', () => page.check(`input[name="cod_tipo_producto"][value="${code}"]`));
    else (report.blockers ??= []).push(`cod_tipo_producto: "${item.tipo ?? ''}" no es un tipo que ofrezca este formulario`);
  }
  await tryField(report, 'txt_nme_prod', () => page.fill('input:not([type="hidden"])[name="txt_nme_prod"]', item.title));
  await tryField(report, 'nro_ano_presenta', () => page.selectOption('select[name="nro_ano_presenta"]', item.year));
  if (item.month) await tryField(report, 'nro_mes_presenta', () => page.selectOption('select[name="nro_mes_presenta"]', month(item.month!)));
  else report.warnings.push('nro_mes_presenta: el ítem no trae "month"; CvLAC guarda Enero');
  if (kind.hasEnd && item.yearEnd) {
    await tryField(report, 'nro_ano_fin', () => page.selectOption('select[name="nro_ano_fin"]', item.yearEnd!));
    if (item.monthEnd) await tryField(report, 'nro_mes_fin', () => page.selectOption('select[name="nro_mes_fin"]', month(item.monthEnd!)));
  }
  if (item.disponibilidad) {
    const value = disponibilidad(item.disponibilidad);
    if (value) await tryField(report, 'txt_disponibilidad', () => page.selectOption('select[name="txt_disponibilidad"]', value));
    else missingValue(report, 'txt_disponibilidad', `"${item.disponibilidad}" no es restringido ni no restringido`);
  }
  if (kind.hasIdioma) {
    const idioma = item.idioma ?? defaults.idioma;
    if (idioma) await tryField(report, 'sgl_idioma', () => page.selectOption('select[name="sgl_idioma"]', idioma.toUpperCase()));
  }
  if (kind.section === 'informesTecnicos') {
    if (item.proyectoId) {
      await tryField(report, 'cod_proyecto', () => page.selectOption('select[name="cod_proyecto"]', item.proyectoId!));
    } else {
      (report.blockers ??= []).push('cod_proyecto: el informe técnico exige un proyecto de investigación');
    }
  }
  for (const { key, field } of kind.extras) {
    const value = item[key];
    if (typeof value === 'string' && value) await tryField(report, field, () => page.fill(`input[name="${field}"]`, value));
  }
  await tryField(report, 'tpo_prod_tiene', () => page.check('input[name="tpo_prod_tiene"][value="N"]'));
  const ciudad = item.ciudad ?? defaults.municipio?.nombre;
  if (ciudad && (await page.$('input[name="cod_municipio_text"]'))) await setMunicipio(page, report, ciudad, defaults.municipio?.codigoDane);
  if (item.institucion) {
    if (kind.institucion) {
      await setInstitucionFields(page, report, item.institucion, kind.institucion.idField, kind.institucion.nmeField, item.institucionId);
      // The technical-report form has both the common readonly picker field
      // and a second required display field named nme_institucion.
      if (kind.section === 'informesTecnicos') await forceSetReadonlyByName(page, 'nme_institucion', item.institucion);
    }
    else missingValue(report, 'institución', 'este formulario usa otro buscador de instituciones; complétala desde la web');
  }
  await humanDelay(200, 300);
}

export const TECNICA_SECTIONS: Record<string, SectionConfig> = Object.fromEntries(
  Object.entries(TECNICA_KINDS).map(([name, kind]) => [
    name,
    {
      ...SECTION_LIST[kind.section],
      createUrl: kind.createUrl,
      labelOf: (item: TechnicalInput) => item.title.trim(),
      fill: (page: Page, data: unknown, report: FillReport) => fillTecnica(kind, page, data as TechnicalInput, report),
    },
  ])
);
