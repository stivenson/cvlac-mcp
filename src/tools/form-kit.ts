import type { Page } from 'playwright';
import type { AmbiguousChoice, CvLACSectionName } from '../types.js';
import { BASE_URL } from '../browser/navigation.js';
import {
  catalogueQuery,
  municipioDisplayName,
  parseDepartamentosXml,
  parseMunicipiosXml,
  pickByName,
  pickMunicipio,
  resolveChoice,
  type CatalogueResolution,
  type MunicipioRow,
} from '../browser/catalogue.js';
import { createLogger } from '../logger.js';

const log = createLogger('form-kit');

/** Timeout used for optional controls that exist only on some CvLAC forms. */
export const FIELD_TIMEOUT_MS = 5000;

export interface FillReport {
  warnings: string[];
  blockers?: string[];
  choices?: AmbiguousChoice[];
}

export interface SectionConfig {
  listUrl: string;
  createUrl: string;
  matchCellIndex: number;
  labelOf: (data: any) => string;
  fill: (page: Page, data: any, report: FillReport) => Promise<void>;
}

/** Run an optional field interaction without hiding a missing or rejected control. */
export async function tryField(report: FillReport, field: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    const detail = err instanceof Error ? err.message.split('\n')[0] : String(err);
    report.warnings.push(`${field}: ${detail}`);
    log.debug('field not filled', { field, detail });
    return false;
  }
}

export function missingValue(report: FillReport, field: string, hint: string): void {
  report.warnings.push(`${field}: sin valor (${hint})`);
  log.debug('field left empty', { field, hint });
}

/** Normalize a string for fuzzy comparisons used by form/catalogue helpers. */
export function normStr(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findInstitucionId(
  page: Page,
  name: string
): Promise<CatalogueResolution<{ id: number; nmeInst: string }>> {
  const searchTerms = [name, ...name.split(/\s+/).filter((w) => w.length > 4).sort((a, b) => b.length - a.length)];

  for (const term of searchTerms) {
    const url = `${BASE_URL}/cvlac/json/EnInstitucion/buscar.do?txt_nombre=${encodeURIComponent(catalogueQuery(term))}`;
    const response = await page.evaluate(async (fetchUrl: string) => {
      const res = await fetch(fetchUrl, { credentials: 'include' });
      if (!res.ok) return { ok: false, items: [] as unknown[] };
      const text = new TextDecoder('latin1').decode(await res.arrayBuffer());
      try {
        return { ok: true, items: JSON.parse(text) };
      } catch {
        return { ok: true, items: [] as unknown[] };
      }
    }, url);

    if (!response.ok) return { kind: 'none' };
    const items = response.items as Array<{ id: number; nmeInst: string }>;
    if (!Array.isArray(items) || items.length === 0) continue;

    const resolved = resolveChoice(items, name, (row) => row.nmeInst);
    if (resolved.kind !== 'none') return resolved;
  }

  return { kind: 'none' };
}

/** Set a readonly institution picker using CvLAC's search catalogue. */
export async function setInstitucionFields(
  page: Page,
  report: FillReport,
  name: string,
  idField: string,
  nmeField: string,
  explicitId?: string
): Promise<void> {
  let found: { id: number; nmeInst: string };

  if (explicitId) {
    found = { id: Number(explicitId), nmeInst: name };
  } else {
    const resolved = await findInstitucionId(page, name);
    if (resolved.kind === 'none') {
      report.warnings.push(`institución "${name}": no existe en el catálogo de CvLAC; el campo queda vacío`);
      log.warn('institution not found in CvLAC catalogue', { name });
      return;
    }
    if (resolved.kind === 'ambiguous') {
      (report.choices ??= []).push({
        field: 'institución',
        value: name,
        options: resolved.options.map((o) => ({ id: String(o.id), label: o.nmeInst })),
      });
      return;
    }
    found = resolved.item;
  }

  await page.evaluate(
    ({ instId, instNme, idF, nmeF }) => {
      const idEl = document.getElementById(idF) as HTMLInputElement | null;
      const nmeEl = document.getElementById(nmeF) as HTMLInputElement | null;
      if (idEl) idEl.value = String(instId);
      if (nmeEl) {
        nmeEl.removeAttribute('readonly');
        nmeEl.value = instNme;
        nmeEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },
    { instId: found.id, instNme: found.nmeInst, idF: idField, nmeF: nmeField }
  );
}

async function resolveMunicipio(
  page: Page,
  name: string
): Promise<{ codMunicipio: string; codRh: string; text: string; sglPais: string } | null> {
  const get = (url: string): Promise<string> =>
    page.evaluate(async (fetchUrl: string) => {
      const res = await fetch(fetchUrl, { credentials: 'include' });
      if (!res.ok) return '';
      return new TextDecoder('latin1').decode(await res.arrayBuffer());
    }, url);

  const raw = await get(
    `${BASE_URL}/cvlac/json/EnMunicipio/buscar.do?txt_nombre=${encodeURIComponent(catalogueQuery(name))}`
  );
  let hit: { txtNmeMunicipio: string; departamento?: { txtNmeDepartamento?: string; pais?: { txtNmePais?: string } } } | null = null;
  try {
    const rows = JSON.parse(raw);
    hit = Array.isArray(rows) ? pickMunicipio(rows as MunicipioRow[], name) : null;
  } catch {
    hit = null;
  }
  if (!hit) return null;

  const paisNombre = hit.departamento?.pais?.txtNmePais ?? 'Colombia';
  const deptoNombre = hit.departamento?.txtNmeDepartamento ?? null;
  const sglPais = paisNombre.toLowerCase() === 'colombia' ? 'COL' : '';
  if (!sglPais) return null;

  const deptos = parseDepartamentosXml(
    await get(`${BASE_URL}/cvlac/binary/ubicacion.xml?methodToCall=getDepartamentosAsXML&sglPais=${sglPais}`)
  );
  const depto = deptoNombre ? pickByName(deptos, deptoNombre) : null;
  if (!depto) return null;

  const municipios = parseMunicipiosXml(
    await get(
      `${BASE_URL}/cvlac/binary/ubicacion.xml?methodToCall=getMunicipiosAsXML` +
        `&sglDepartamento=${encodeURIComponent(depto.id)}&sglPais=${sglPais}`
    )
  );
  const municipio = pickByName(municipios, name);
  if (!municipio) return null;

  return {
    codMunicipio: municipio.id,
    codRh: municipio.codRh,
    text: municipioDisplayName(paisNombre, depto.name, municipio.name),
    sglPais,
  };
}

/** Fill the readonly municipality picker and all hidden values it controls. */
export async function setMunicipio(
  page: Page,
  report: FillReport,
  nombre: string | undefined,
  codigoDane: string | undefined
): Promise<void> {
  if (!nombre) {
    missingValue(report, 'municipio', 'define defaults.municipio.nombre en cvlac.config.json');
    return;
  }

  const found = await resolveMunicipio(page, nombre);
  if (!found) {
    report.warnings.push(`municipio "${nombre}": no se pudo resolver en el catálogo de CvLAC; el campo queda vacío`);
    log.warn('municipality not resolved', { nombre });
    return;
  }
  if (codigoDane && codigoDane !== found.codMunicipio) {
    report.warnings.push(
      `municipio: se ignoró el código ${codigoDane} porque CvLAC numera sus municipios aparte del DANE ` +
        `(${found.text} es ${found.codMunicipio} para el formulario)`
    );
  }

  const applied = await page.evaluate(
    ({ text, code, codRh, sglPais }) => {
      const textEl = document.querySelector('input[name="cod_municipio_text"]') as HTMLInputElement | null;
      if (!textEl) return false;
      textEl.removeAttribute('readonly');
      textEl.value = text;

      const suffix = textEl.id.replace('_loc_', '');
      const setById = (id: string, value: string): void => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el) el.value = value;
      };
      setById('_locValue_' + suffix, code);
      setById('_locRHValue_' + suffix, codRh);
      setById('_locPaisValue_' + suffix, sglPais);
      for (const el of Array.from(document.querySelectorAll('input[name="cod_municipio"]')) as HTMLInputElement[]) el.value = code;
      for (const el of Array.from(document.querySelectorAll('input[name="cod_rh_municipio"]')) as HTMLInputElement[]) el.value = codRh;
      return true;
    },
    { text: found.text, code: found.codMunicipio, codRh: found.codRh, sglPais: found.sglPais }
  );
  if (!applied) report.warnings.push('municipio: el formulario no tiene cod_municipio_text');
}

export async function forceSetReadonly(page: Page, fieldId: string, value: string): Promise<boolean> {
  return page.evaluate(
    ({ id, val }) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (!el) return false;
      el.removeAttribute('readonly');
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    { id: fieldId, val: value }
  );
}

export async function forceSetReadonlyByName(page: Page, fieldName: string, value: string): Promise<boolean> {
  return page.evaluate(
    ({ name, val }) => {
      const el = document.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
      if (!el) return false;
      el.removeAttribute('readonly');
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    { name: fieldName, val: value }
  );
}

export async function setReadonlyField(
  page: Page,
  report: FillReport,
  fieldName: string,
  value: string,
  byId = false
): Promise<void> {
  const ok = byId
    ? await forceSetReadonly(page, fieldName, value)
    : await forceSetReadonlyByName(page, fieldName, value);
  if (!ok) report.warnings.push(`${fieldName}: el formulario no tiene ese campo`);
}

export async function humanDelay(min = 300, max = 800): Promise<void> {
  const ms = min + Math.random() * (max - min);
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Remove `required` from controls that are not rendered.
 *
 * CvLAC's technical-production forms mark the trade-secret block required even
 * while it is hidden. Chromium then refuses to submit the form at all. Visible
 * controls keep `required`, so the form's own validation remains authoritative.
 */
export async function relaxHiddenRequired(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const relaxed: string[] = [];
    for (const el of Array.from(document.querySelectorAll('[required]')) as HTMLElement[]) {
      const input = el as HTMLInputElement;
      const hidden = input.type === 'hidden' || el.offsetParent === null;
      if (hidden) {
        el.removeAttribute('required');
        relaxed.push(el.getAttribute('name') ?? el.id);
      }
    }
    return relaxed;
  });
}

// Kept as a type-only anchor so product modules can import the section type from one place.
export type ProductSectionName = Extract<CvLACSectionName, string>;
