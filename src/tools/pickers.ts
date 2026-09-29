/**
 * Catalogue pickers used by bibliographic and technical-product forms.
 *
 * CvLAC's popups are ordinary POST-backed selects. These helpers search from
 * the already authenticated page, parse the returned options, and write the
 * same hidden values the popup's JavaScript would write. Missing catalogues
 * block a submit; ambiguous ones are returned to a person.
 */
import type { Page } from 'playwright';
import {
  parseProgramaOptions,
  resolveChoice,
  type CatalogueOption,
  type CatalogueResolution,
} from '../browser/catalogue.js';
import { catalogueQuery } from '../browser/catalogue.js';
import { BASE_URL, URLS } from '../browser/navigation.js';
import { navigate } from '../browser/navigate.js';
import { readAreaCatalogue, type CatalogueArea } from './areas.js';
import type { FillReport } from './form-kit.js';

const OPTION_RE = /<option\s+value=['"]([^'"]*)['"][^>]*>([\s\S]*?)<\/option>/gi;
const clean = (text: string): string => text.replace(/\s+/g, ' ').trim();

export function normalizeIssn(raw: string | undefined | null): string | null {
  const digits = (raw ?? '').replace(/[^0-9xX]/g, '').toUpperCase();
  return /^\d{7}[\dX]$/.test(digits) ? `${digits.slice(0, 4)}-${digits.slice(4)}` : null;
}

export interface RevistaOption {
  value: string;
  issn: string | null;
  name: string;
  kind: 'catalogo' | 'otra';
}

export function parseRevistaOptions(html: string): RevistaOption[] {
  const out: RevistaOption[] = [];
  for (const match of html.matchAll(OPTION_RE)) {
    const value = match[1].trim();
    const text = clean(match[2]);
    if (!value || !text) continue;
    if (value.startsWith('0000000000')) {
      const issn = /^\((\w{8})\)\s*/.exec(text);
      out.push({
        value,
        issn: normalizeIssn(issn?.[1]),
        name: issn ? text.slice(issn[0].length) : text,
        kind: 'catalogo',
      });
    } else {
      out.push({ value, issn: null, name: clean(text.slice(4)), kind: 'otra' });
    }
  }
  return out;
}

export function pickRevista(
  options: RevistaOption[],
  wanted: { issn?: string; name?: string }
): CatalogueResolution<RevistaOption> {
  const issn = normalizeIssn(wanted.issn);
  if (issn) {
    const hits = options.filter((option) => option.issn === issn);
    if (hits.length === 1) return { kind: 'exact', item: hits[0] };
    if (hits.length > 1) return { kind: 'ambiguous', options: hits };
    return { kind: 'none' };
  }
  return wanted.name ? resolveChoice(options, wanted.name, (option) => option.name) : { kind: 'none' };
}

export interface LibroOption {
  value: string;
  codRh: string;
  codProducto: string;
  label: string;
  kind: 'referencia' | 'otro';
}

export function parseLibroOptions(html: string): LibroOption[] {
  const out: LibroOption[] = [];
  for (const match of html.matchAll(OPTION_RE)) {
    const value = match[1].trim();
    const hash = value.indexOf('#');
    if (hash < 0) continue;
    const codRh = value.slice(0, hash);
    const kind = codRh === '0000000000' ? 'referencia' : 'otro';
    const text = clean(match[2]);
    out.push({
      value,
      codRh,
      codProducto: value.slice(hash + 1),
      label: kind === 'otro' ? text.slice(1).trim() : text,
      kind,
    });
  }
  return out;
}

export interface EditorialOption {
  value: string;
  code: string;
  label: string;
  kind: 'catalogo' | 'otra';
}

export function parseEditorialOptions(html: string): EditorialOption[] {
  const out: EditorialOption[] = [];
  for (const match of html.matchAll(OPTION_RE)) {
    const value = match[1].trim();
    const prefix = value.slice(0, 2);
    if (prefix !== 'ED' && prefix !== 'CV') continue;
    out.push({ value, code: value.slice(2), label: clean(match[2]), kind: prefix === 'ED' ? 'catalogo' : 'otra' });
  }
  return out;
}

async function setUnique(page: Page, selector: string, value: string): Promise<void> {
  const count = await page.evaluate(
    ({ selector: sel, value: val }) => {
      const elements = Array.from(document.querySelectorAll(sel)) as HTMLInputElement[];
      if (elements.length === 1) {
        elements[0].removeAttribute('readonly');
        elements[0].value = val;
        elements[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
      return elements.length;
    },
    { selector, value }
  );
  if (count !== 1) throw new Error(`${selector}: expected one field, found ${count}`);
}

export type CatalogueSearch = (path: string, body: Record<string, string>) => Promise<string>;

export async function applyRevista(page: Page, option: RevistaOption): Promise<void> {
  const code = option.value.slice(10);
  const catalogo = option.kind === 'catalogo';
  await setUnique(page, '[name="cod_revista"]', catalogo ? code : '');
  await setUnique(page, '[name="cod_revista_otro"]', catalogo ? '' : code);
  await setUnique(page, '[name="tpo_revista"]', catalogo ? 'PD' : 'CV');
  await setUnique(
    page,
    '[name="txt_nme_revista"]',
    catalogo && option.issn ? `(${option.issn.replace('-', '')}) ${option.name}` : option.name
  );
}

export async function applyLibro(page: Page, option: LibroOption): Promise<void> {
  const reference = option.kind === 'referencia';
  await setUnique(page, '[name="cod_libro_ref"]', reference ? option.codProducto : '');
  await setUnique(page, '[name="null"]', reference ? '' : option.codProducto);
  await setUnique(page, '[name="txt_nme_libro"]', option.label);
}

export async function applyEditorial(page: Page, option: EditorialOption): Promise<void> {
  const catalogue = option.kind === 'catalogo';
  await setUnique(page, '[name="cod_editorial"]', catalogue ? option.code : '');
  // The current book form calls this field cod_editorial_otro. Older product
  // forms used an unnamed `null` field, so keep that fallback for them.
  const otherField = (await page.locator('[name="cod_editorial_otro"]').count())
    ? '[name="cod_editorial_otro"]'
    : '[name="null"]';
  await setUnique(page, otherField, catalogue ? '' : option.code);
  await setUnique(page, '#txt_nme_editorial1', option.label);
}

async function postSearch(page: Page, path: string, body: Record<string, string>): Promise<string> {
  const encoded = Object.entries(body)
    .map(([key, value]) => `${key}=${encodeURIComponent(catalogueQuery(value))}`)
    .join('&');
  return page.evaluate(
    async ({ url, body: requestBody }) => {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: requestBody,
      });
      if (!response.ok) throw new Error(`catalogue search answered ${response.status}`);
      return new TextDecoder('latin1').decode(await response.arrayBuffer());
    },
    { url: `${BASE_URL}${path}`, body: encoded }
  );
}

const REVISTA_SEARCH =
  '/cvlac/EnRevista/queryRevista.do?__form=enProdArticuloInsertForm&__nme_revista=txt_nme_revista' +
  '&__cod_revista=cod_revista&__cod_revista_otro=cod_revista_otro&__tipo_revista=tpo_revista&tpo_busqueda=ES';

export async function setRevista(
  page: Page,
  report: FillReport,
  wanted: { issn?: string; name?: string; revistaId?: string },
  search: CatalogueSearch = (path, body) => postSearch(page, path, body)
): Promise<void> {
  const issn = normalizeIssn(wanted.issn);
  const options = parseRevistaOptions(
    await search(REVISTA_SEARCH, { nme_revista: issn ? '' : wanted.name ?? '', txt_issn: issn ?? '' })
  );
  if (wanted.revistaId) {
    const chosen = options.find((option) => option.value === wanted.revistaId);
    if (!chosen) {
      (report.blockers ??= []).push(`revista: "${wanted.revistaId}" no está entre los resultados de la búsqueda`);
      return;
    }
    await applyRevista(page, chosen);
    return;
  }
  const pick = pickRevista(options, { issn: issn ?? undefined, name: wanted.name });
  if (pick.kind === 'none') {
    (report.blockers ??= []).push(
      `revista: "${issn ?? wanted.name ?? ''}" no está en el catálogo de revistas especializadas de CvLAC; ` +
        'sin revista no hay artículo (revisa el ISSN o regístrala desde la web)'
    );
    return;
  }
  if (pick.kind === 'ambiguous') {
    (report.choices ??= []).push({
      field: 'revista',
      value: issn ?? wanted.name ?? '',
      options: pick.options.map((option) => ({ id: option.value, label: option.issn ? `(${option.issn}) ${option.name}` : option.name })),
    });
    return;
  }
  await applyRevista(page, pick.item);
}

const LIBRO_SEARCH = '/cvlac/EnLibro/queryLibro.do?__form=enProdCapituloLibroInsertForm&__text=txt_nme_libro&__codlibro=cod_libro_ref';

export async function setLibroRef(
  page: Page,
  report: FillReport,
  wanted: { title: string; isbn?: string; libroId?: string },
  search: CatalogueSearch = (path, body) => postSearch(page, path, body)
): Promise<void> {
  const options = parseLibroOptions(
    await search(LIBRO_SEARCH, { nme_libro: wanted.isbn ? '' : wanted.title, isbn: wanted.isbn ?? '' })
  );
  const chosen = wanted.libroId ? options.find((option) => option.value === wanted.libroId) ?? null : null;
  const pick = chosen ? ({ kind: 'exact', item: chosen } as const) : resolveChoice(options, wanted.title, (option) => option.label);
  if (pick.kind === 'none') {
    (report.blockers ??= []).push(
      `libro: "${wanted.title}" no aparece en el buscador de libros de CvLAC; regístralo antes en "libros"`
    );
    return;
  }
  if (pick.kind === 'ambiguous') {
    (report.choices ??= []).push({ field: 'libro', value: wanted.title, options: pick.options.map((option) => ({ id: option.value, label: option.label })) });
    return;
  }
  await applyLibro(page, pick.item);
}

const EDITORIAL_SEARCH = '/cvlac/EnEditorial/queryEditorial.do?__form=enLibroInsertForm&__text=txt_nme_editorial1&__value=cod_editorial';

export async function setEditorial(
  page: Page,
  report: FillReport,
  wanted: { name: string; editorialId?: string },
  search: CatalogueSearch = (path, body) => postSearch(page, path, body)
): Promise<void> {
  const options = parseEditorialOptions(await search(EDITORIAL_SEARCH, { nme_editorial: wanted.name }));
  const chosen = wanted.editorialId ? options.find((option) => option.value === wanted.editorialId) ?? null : null;
  const pick = chosen ? ({ kind: 'exact', item: chosen } as const) : resolveChoice(options, wanted.name, (option) => option.label);
  if (pick.kind === 'none') {
    (report.blockers ??= []).push(`editorial: "${wanted.name}" no está en el catálogo de editoriales de CvLAC; créala desde la web`);
    return;
  }
  if (pick.kind === 'ambiguous') {
    (report.choices ??= []).push({ field: 'editorial', value: wanted.name, options: pick.options.map((option) => ({ id: option.value, label: option.label })) });
    return;
  }
  await applyEditorial(page, pick.item);
}

export function programaSearchPath(p: { form: string; textField: string; institucionId: string }): string {
  const query = new URLSearchParams({
    txt_nme_inst: 'institucion',
    __form: p.form,
    __text: p.textField,
    __value: 'cod_rh_programa_academico',
    id_institucion: p.institucionId,
  });
  return `/cvlac/EnProgramaAcademico/queryPrograma.do?${query.toString()}`;
}

export async function applyPrograma(page: Page, textField: string, option: CatalogueOption): Promise<void> {
  await setUnique(page, '[name="cod_rh_programa_academico"]', option.value);
  await setUnique(page, `[name="${textField}"]`, option.label);
}

export async function setProgramaInstitucion(
  page: Page,
  report: FillReport,
  p: { form: string; textField: string; institucionField: string; degree: string; programaId?: string },
  search: CatalogueSearch = (path, body) => postSearch(page, path, body)
): Promise<void> {
  const institucionId = await page
    .evaluate((field) => (document.querySelector(`[name="${field}"]`) as HTMLInputElement | null)?.value ?? '', p.institucionField)
    .catch(() => '');
  if (!institucionId) {
    (report.blockers ??= []).push('programa académico: se busca dentro de la institución, y la institución quedó sin resolver');
    return;
  }
  const options = parseProgramaOptions(
    await search(programaSearchPath({ form: p.form, textField: p.textField, institucionId }), {
      txt_nme_programa_acad: p.degree,
    })
  );
  const chosen = p.programaId ? options.find((option) => option.value === p.programaId) ?? null : null;
  const pick = chosen ? ({ kind: 'exact', item: chosen } as const) : resolveChoice(options, p.degree, (option) => option.label);
  if (pick.kind === 'none') {
    (report.blockers ??= []).push(`programa académico: "${p.degree}" no está entre los programas de esa institución en CvLAC`);
    return;
  }
  if (pick.kind === 'ambiguous') {
    (report.choices ??= []).push({ field: 'programa académico', value: p.degree, options: pick.options.map((option) => ({ id: option.value, label: option.label })) });
    return;
  }
  await applyPrograma(page, p.textField, pick.item);
}

export function productAreaLabel(catalogue: CatalogueArea[], area: CatalogueArea): string {
  const byCode = new Map(catalogue.map((item) => [item.code, item]));
  const chain: CatalogueArea[] = [];
  for (let current: CatalogueArea | undefined = area; current; current = current.parent ? byCode.get(current.parent) : undefined) {
    chain.unshift(current);
  }
  return [chain[0], chain[1], area]
    .filter((item, index, items): item is CatalogueArea => Boolean(item) && items.indexOf(item) === index)
    .map((item) => item.name)
    .join(' - ');
}

export function resolveProductArea(catalogue: CatalogueArea[], wanted: string): CatalogueResolution<CatalogueArea> {
  const eligible = catalogue.filter((area) => area.level >= 2);
  const byCode = eligible.find((area) => area.code.toLowerCase() === wanted.trim().toLowerCase());
  if (byCode) return { kind: 'exact', item: byCode };
  return resolveChoice(eligible, wanted, (area) => area.name);
}

let areaCache: CatalogueArea[] | null = null;

async function productAreaCatalogue(page: Page): Promise<CatalogueArea[]> {
  if (areaCache?.length) return areaCache;
  const tab = await page.context().newPage();
  try {
    await navigate(tab, URLS.areasCatalogo);
    areaCache = await readAreaCatalogue(tab);
  } finally {
    await tab.close();
  }
  return areaCache;
}

export async function setProductArea(
  page: Page,
  report: FillReport,
  wanted: string,
  areaId?: string,
  load: (page: Page) => Promise<CatalogueArea[]> = productAreaCatalogue
): Promise<void> {
  const catalogue = await load(page);
  const pick = resolveProductArea(catalogue, areaId ?? wanted);
  if (pick.kind === 'none') {
    (report.blockers ??= []).push(`área de conocimiento: "${wanted}" no es una disciplina o especialidad del catálogo de CvLAC`);
    return;
  }
  if (pick.kind === 'ambiguous') {
    (report.choices ??= []).push({
      field: 'área de conocimiento',
      value: wanted,
      options: pick.options.map((area) => ({ id: area.code, label: productAreaLabel(catalogue, area) })),
    });
    return;
  }
  await setUnique(page, '[name="cod_area_conocimiento"]', pick.item.code);
  await setUnique(page, '[name="nombre_area"]', productAreaLabel(catalogue, pick.item));
}
