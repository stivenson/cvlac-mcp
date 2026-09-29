import type { Page } from 'playwright';
import { readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import type { BookInput } from '../../types.js';
import type { CatalogueArea } from '../areas.js';
import { SECTION_LIST, URLS } from '../../browser/navigation.js';
import { countryOption } from '../../browser/catalogue.js';
import { humanDelay, missingValue, tryField, type FillReport, type SectionConfig } from '../form-kit.js';
import { setEditorial, setProductArea, type CatalogueSearch } from '../pickers.js';
import { libroPublicacion, medioPublicacion } from './codes.js';

export function normalizeIsbn(raw: string): string | null {
  const value = (raw ?? '').replace(/[^0-9xX]/g, '').toUpperCase();
  return /^\d{9}[\dX]$/.test(value) || /^\d{13}$/.test(value) ? value : null;
}

export const MAX_CERTIFICATE_BYTES = 2 * 1024 * 1024;

export interface CertificateFileCheck {
  ok: boolean;
  path?: string;
  message?: string;
}

/** Validate a local certificate before Playwright sends it to CvLAC. */
export function validateCertificateFile(filePath: string): CertificateFileCheck {
  const raw = filePath.trim();
  if (!raw) return { ok: false, message: 'la ruta está vacía' };

  const path = resolve(raw);
  if (extname(path).toLowerCase() !== '.pdf') return { ok: false, message: 'debe tener extensión .pdf' };

  let size: number;
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return { ok: false, message: 'la ruta no apunta a un archivo regular' };
    size = stat.size;
  } catch {
    return { ok: false, message: 'el archivo no existe o no se puede leer' };
  }
  if (size === 0) return { ok: false, message: 'el archivo está vacío' };
  if (size > MAX_CERTIFICATE_BYTES) return { ok: false, message: 'supera el límite de 2 MiB' };

  try {
    const header = readFileSync(path).subarray(0, 5).toString('ascii');
    if (header !== '%PDF-') return { ok: false, message: 'no comienza con la firma de un PDF válido' };
  } catch {
    return { ok: false, message: 'el archivo no se puede leer' };
  }
  return { ok: true, path };
}

async function attachCertificate(
  page: Page,
  report: FillReport,
  field: 'file_CLCDO' | 'file_CLRI',
  filePath: string | undefined
): Promise<void> {
  if (filePath === undefined) return;
  const check = validateCertificateFile(filePath);
  if (!check.ok || !check.path) {
    (report.blockers ??= []).push(`${field}: ${check.message ?? 'archivo inválido'}`);
    return;
  }
  try {
    await page.setInputFiles(`input[name="${field}"]`, check.path);
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
    (report.blockers ??= []).push(`${field}: no se pudo adjuntar el archivo (${detail})`);
  }
}

export async function fillLibro(page: Page, item: BookInput, report: FillReport, deps: { search?: CatalogueSearch; areas?: (page: Page) => Promise<CatalogueArea[]> } = {}): Promise<void> {
  await tryField(report, 'txt_nme_prod', () => page.fill('input:not([type="hidden"])[name="txt_nme_prod"]', item.title));
  const isbn = normalizeIsbn(item.isbn);
  if (isbn) await tryField(report, 'txt_isbn', () => page.fill('input[name="txt_isbn"]', isbn));
  else (report.blockers ??= []).push(`txt_isbn: "${item.isbn}" no es un ISBN de 10 o 13 cifras`);
  await tryField(report, 'nro_ano_presenta', () => page.selectOption('select[name="nro_ano_presenta"]', item.year));
  if (item.month) await tryField(report, 'nro_mes_presenta', () => page.selectOption('select[name="nro_mes_presenta"]', String(parseInt(item.month!, 10))));
  else (report.blockers ??= []).push('nro_mes_presenta: el formulario de libro exige el mes y el ítem no lo trae');
  if (item.publicacion) {
    const pub = libroPublicacion(item.publicacion);
    if (pub) await tryField(report, 'tpo_publicacion', () => page.check(`input[name="tpo_publicacion"][value="${pub}"]`));
    else missingValue(report, 'tpo_publicacion', `"${item.publicacion}" no es nacional, internacional ni Book Citation Index`);
  }
  const pais = countryOption(item.pais ?? 'CO');
  if (pais) await tryField(report, 'sgl_pais', () => page.selectOption('select[name="sgl_pais"]', pais));
  if (item.medio) {
    const medio = medioPublicacion(item.medio);
    if (medio) await tryField(report, 'tpo_medio_divulgacion', () => page.selectOption('select[name="tpo_medio_divulgacion"]', medio));
    else missingValue(report, 'tpo_medio_divulgacion', `"${item.medio}" no es papel ni electrónico`);
  }
  await setEditorial(page, report, { name: item.editorial, editorialId: item.editorialId }, deps.search);
  await setProductArea(page, report, item.area, item.areaId, deps.areas);
  await attachCertificate(page, report, 'file_CLCDO', item.certificateCLCDO);
  await attachCertificate(page, report, 'file_CLRI', item.certificateCLRI);
  await humanDelay(200, 300);
}

export const librosSection: SectionConfig = {
  ...SECTION_LIST.libros,
  createUrl: URLS.librosCreate,
  labelOf: (item: BookInput) => item.title.trim(),
  fill: (page, data, report) => fillLibro(page, data as BookInput, report),
};
