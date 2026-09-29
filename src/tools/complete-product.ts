import type { Page } from 'playwright';
import { BASE_URL, toCvLacUrl } from '../browser/navigation.js';
import { navigate } from '../browser/navigate.js';
import { session } from '../browser/session.js';
import { readAreaCatalogue, readAreas, applyAreas, type Area, type CatalogueArea } from './areas.js';
import { lookupRow } from './update-section.js';
import { PRODUCT_SECTIONS } from './products/index.js';
import type { SectionConfig } from './form-kit.js';
import { productAreaLabel, resolveProductArea } from './pickers.js';
import { normStr } from './form-kit.js';
import { createLogger } from '../logger.js';
import type {
  AmbiguousChoice,
  CompleteProductRequest,
  ProductStudentInput,
  ProductCompletionSection,
  UpdateResult,
} from '../types.js';

const log = createLogger('complete-product');

export const PRODUCT_COMPLETION_SECTIONS = [
  'articulos',
  'libros',
  'capitulos',
  'tesis',
  'jurados',
  'informesTecnicos',
  'innovacionesProceso',
  'productosTecnologicos',
  'consultorias',
  'prototipos',
] as const satisfies readonly ProductCompletionSection[];

type Phase = 'keywords' | 'coauthors' | 'areas' | 'students' | 'recognitions';

interface KeywordValue {
  code: string;
  name: string;
}

interface KeywordState {
  selected: KeywordValue[];
  personal: KeywordValue[];
}

export interface PersonValue {
  code: string;
  name: string;
}

export interface RecognitionValue {
  code: string;
  name: string;
}

export interface StudentValue extends PersonValue {
  participation: string;
  participationName: string;
}

export interface StudentState {
  types: Record<string, string>;
  students: StudentValue[];
}

interface ResolvedArea extends Area {
  label: string;
}

function absolute(href: string): string {
  return toCvLacUrl(href);
}

function stripPosition(value: string): string {
  return (value ?? '').replace(/^\d+\./, '').trim();
}

function stripLabelPosition(value: string): string {
  return (value ?? '').replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim();
}

export function parseKeywordValue(value: string, label: string): KeywordValue | null {
  const code = stripPosition(value);
  const name = stripLabelPosition(label);
  return code && name ? { code, name } : null;
}

export function parseCoauthorValue(value: string, label: string): PersonValue | null {
  const code = value.replace(/^\d+\./, '').trim();
  const name = stripLabelPosition(label);
  return code && name ? { code, name } : null;
}

export function parseCoauthorCatalogue(
  links: Array<{ href: string | null; text: string | null }>
): PersonValue[] {
  const out: PersonValue[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const match = (link.href ?? '').match(/addRh\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)/);
    if (!match) continue;
    const code = match[1].trim();
    const name = (link.text || match[2]).replace(/\s+/g, ' ').trim();
    if (!code || !name || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name });
  }
  return out;
}

export function parseRecognitionValue(value: string, label: string): RecognitionValue | null {
  const code = stripPosition(value);
  const name = stripLabelPosition(label).replace(/\s+Año:\s*\d{4}\s*$/i, '').trim();
  return code && name ? { code, name } : null;
}

export function parseRecognitionCatalogue(
  links: Array<{ href: string | null; text: string | null }>
): RecognitionValue[] {
  const out: RecognitionValue[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const href = link.href ?? '';
    const codeMatch = href.match(/addReconocimiento\(\s*['"]([^'"]+)['"]/);
    if (!codeMatch) continue;
    const nameFromText = (link.text ?? '').replace(/\s+Año:\s*\d{4}\s*$/i, '').trim();
    const nameFromHref = href.match(/addReconocimiento\(\s*['"][^'"]+['"]\s*,\s*['"]([\s\S]*?)['"]\s*\)/)?.[1] ?? '';
    const code = codeMatch[1].trim();
    const name = (nameFromText || nameFromHref).replace(/\s+/g, ' ').trim();
    if (!code || !name || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name });
  }
  return out;
}

export function parseStudentResponse(payload: unknown): StudentState {
  const body = (payload ?? {}) as {
    tiposParticipacion?: Record<string, string>;
    coautores?: Array<{ codRh?: string; txtTotalNames?: string; tpoParticipacion?: string; nmeParticipacion?: string }>;
  };
  const types = body.tiposParticipacion ?? {};
  const students = (body.coautores ?? [])
    .map((row) => ({
      code: String(row.codRh ?? '').trim(),
      name: String(row.txtTotalNames ?? '').replace(/\s+/g, ' ').trim(),
      participation: String(row.tpoParticipacion ?? '').trim(),
      participationName: String(row.nmeParticipacion ?? types[row.tpoParticipacion ?? ''] ?? '').trim(),
    }))
    .filter((row) => row.code && row.name && row.participation);
  return { types, students };
}

/** Reads both the product's current keywords and the user's reusable catalogue. */
export async function readKeywordState(page: Page): Promise<KeywordState> {
  return page.evaluate(() => {
    const parse = (value: string, label: string): KeywordValue | null => {
      const code = (value ?? '').replace(/^\d+\./, '').trim();
      const name = (label ?? '').replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim();
      return code && name ? { code, name } : null;
    };
    const select = document.querySelector<HTMLSelectElement>('select[name="cod_palabra_clave"]');
    const selected = Array.from(select?.options ?? [])
      .map((option) => parse(option.value, option.text))
      .filter((item): item is KeywordValue => item !== null);
    const personal = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'))
      .map((link) => {
        const source = `${link.getAttribute('href') ?? ''} ${link.getAttribute('onclick') ?? ''}`;
        const match = source.match(/addPalabra\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)/);
        return match ? { code: match[1], name: match[2].replace(/\s+/g, ' ').trim() } : null;
      })
      .filter((item): item is KeywordValue => item !== null);
    return { selected, personal };
  });
}

export function sameOrderedCodes(left: Array<{ code: string }>, right: Array<{ code: string }>): boolean {
  return left.length === right.length && left.every((item, index) => item.code === right[index]?.code);
}

export function removedValues<T extends { code: string; name: string }>(
  current: T[],
  desired: T[]
): string[] {
  const kept = new Set(desired.map((item) => item.code));
  return current.filter((item) => !kept.has(item.code)).map((item) => item.name);
}

async function phaseUrl(page: Page, phase: Phase): Promise<string | null> {
  if (phase === 'students') {
    const url = await page.evaluate(() => {
      const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('a')).find((candidate) =>
        /registrar personas/i.test(candidate.textContent ?? '')
      );
      if (!link) return null;
      const productId = new URL(location.href).searchParams.get('cod_producto');
      const scriptText = Array.from(document.scripts).map((script) => script.textContent ?? '').join('\n');
      const type = scriptText.match(/codTipoProducto\s*=\s*['"]([^'"]+)['"]/i)?.[1];
      return productId && type
        ? `/cvlac/exclude/ReProductoRecursoHumano/all.do?cod_producto=${encodeURIComponent(productId)}&cod_tipo_producto=${encodeURIComponent(type)}`
        : null;
    });
    return url ? absolute(url) : null;
  }
  const patterns: Record<Phase, RegExp> = {
    keywords: /palabra/i,
    coauthors: /coautor/i,
    areas: /gran área|area y disciplina|área y disciplina/i,
    students: /persona|estudiante/i,
    recognitions: /reconocimiento/i,
  };
  return page.evaluate((patternSource) => {
    const pattern = new RegExp(patternSource, 'i');
    const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('a')).find((candidate) =>
      pattern.test(candidate.textContent ?? '') && /\/cvlac\/[^'"\s]+\.do\?/i.test(candidate.getAttribute('onclick') ?? '')
    );
    if (!link) return null;
    const onclick = link.getAttribute('onclick') ?? '';
    const quoted = onclick.match(/['"](\/cvlac\/[^'"]+?\.do\?[^'"]*)['"]/);
    if (quoted) return quoted[1];
    return null;
  }, patterns[phase].source).then((url) => (url ? absolute(url) : null));
}

async function readCoauthorState(page: Page): Promise<PersonValue[]> {
  const raw = await page.$$eval('select[name="cod_rh_otro"] option', (options) =>
    options.map((option) => {
      const item = option as HTMLOptionElement;
      return { value: item.value, text: item.text };
    })
  );
  return raw.map((item) => parseCoauthorValue(item.value, item.text)).filter((item): item is PersonValue => item !== null);
}

async function readCoauthorCatalogue(page: Page, coauthorUrl: string): Promise<PersonValue[]> {
  const query = new URL(coauthorUrl).searchParams;
  const codRh = query.get('cod_rh') ?? '';
  if (!codRh) return [];
  const cataloguePage = await session.getPage();
  try {
    await navigate(
      cataloguePage,
      `${BASE_URL}/cvlac/popup/ReProductoRecursoHumOtro/rhOtroAll.do?cod_rh_crea=${encodeURIComponent(codRh)}`
    );
    const links = await cataloguePage.$$eval('a', (anchors) =>
      anchors.map((anchor) => ({ href: anchor.getAttribute('href'), text: anchor.textContent }))
    );
    return parseCoauthorCatalogue(links);
  } finally {
    await cataloguePage.close();
  }
}

async function resolveCoauthors(
  page: Page,
  coauthorUrl: string,
  wanted: string[],
  choices: AmbiguousChoice[],
  blockers: string[],
  warnings: string[]
): Promise<{ current: PersonValue[]; desired: PersonValue[] }> {
  await navigate(page, coauthorUrl);
  const current = await readCoauthorState(page);
  const catalogue = await readCoauthorCatalogue(page, coauthorUrl);
  const desired: PersonValue[] = [];
  const seen = new Set<string>();
  const owner = current.find((person) => person.code === '0') ?? catalogue.find((person) => person.code === '0');
  if (owner) {
    desired.push(owner);
    seen.add(owner.code);
  }

  for (const raw of wanted) {
    const name = raw.trim();
    if (!name) continue;
    const matches = catalogue.filter((person) => normStr(person.name) === normStr(name));
    if (matches.length === 0) {
      const partial = catalogue.filter((person) => {
        const candidate = normStr(person.name);
        const target = normStr(name);
        return candidate.includes(target) || target.includes(candidate);
      });
      if (partial.length === 1) matches.push(partial[0]);
      else if (partial.length > 1) {
        choices.push({
          field: 'coautor',
          value: name,
          options: partial.slice(0, 10).map((person) => ({ id: person.code, label: person.name })),
        });
        continue;
      }
    }
    if (matches.length === 0) {
      blockers.push(`coautor: "${name}" no existe en el catálogo de coautores previamente registrados de CvLAC`);
      continue;
    }
    const person = matches[0];
    if (seen.has(person.code)) {
      warnings.push(`coautores: se ignoró la persona repetida "${name}"`);
      continue;
    }
    seen.add(person.code);
    desired.push(person);
  }
  return { current, desired };
}

async function setCoauthorList(page: Page, coauthorUrl: string, desired: PersonValue[]): Promise<PersonValue[]> {
  await navigate(page, coauthorUrl);
  await page.evaluate((people) => {
    const select = document.querySelector<HTMLSelectElement>('select[name="cod_rh_otro"]');
    if (!select) throw new Error('CvLAC no mostró la lista de coautores');
    select.innerHTML = '';
    people.forEach((person, index) => {
      const option = new Option(`${index + 1}. ${person.name}`, `${index + 1}.${person.code}`);
      option.selected = true;
      select.add(option);
    });
  }, desired);
  await submitAndWait(page, 'form[name="reProductoRecursoHumOtroUpdateForm"] input[type="button"]');
  await navigate(page, coauthorUrl);
  return readCoauthorState(page);
}

async function readRecognitionState(page: Page): Promise<RecognitionValue[]> {
  const raw = await page.$$eval('#lista_reconocimiento option', (options) =>
    options.map((option) => {
      const item = option as HTMLOptionElement;
      return { value: item.value, text: item.text };
    })
  );
  return raw
    .map((item) => parseRecognitionValue(item.value, item.text))
    .filter((item): item is RecognitionValue => item !== null);
}

async function readRecognitionCatalogue(page: Page, recognitionUrl: string): Promise<RecognitionValue[]> {
  const query = new URL(recognitionUrl).searchParams;
  const codRh = query.get('cod_rh') ?? '';
  const productId = query.get('cod_producto') ?? '';
  if (!codRh || !productId) return [];
  const cataloguePage = await session.getPage();
  try {
    await navigate(
      cataloguePage,
      `${BASE_URL}/cvlac/popup/ReProductoReconocimiento/reconocimientoAll.do?cod_rh=${encodeURIComponent(codRh)}&cod_producto=${encodeURIComponent(productId)}`
    );
    const links = await cataloguePage.$$eval('a', (anchors) =>
      anchors.map((anchor) => ({ href: anchor.getAttribute('href'), text: anchor.textContent }))
    );
    return parseRecognitionCatalogue(links);
  } finally {
    await cataloguePage.close();
  }
}

async function resolveRecognitions(
  page: Page,
  recognitionUrl: string,
  wanted: string[],
  choices: AmbiguousChoice[],
  blockers: string[],
  warnings: string[]
): Promise<{ current: RecognitionValue[]; desired: RecognitionValue[] }> {
  await navigate(page, recognitionUrl);
  const current = await readRecognitionState(page);
  const catalogue = await readRecognitionCatalogue(page, recognitionUrl);
  const desired: RecognitionValue[] = [];
  const seen = new Set<string>();
  for (const raw of wanted) {
    const name = raw.trim();
    if (!name) continue;
    const target = normStr(name);
    let matches = catalogue.filter((recognition) => normStr(recognition.name) === target);
    if (matches.length === 0) {
      const partial = catalogue.filter((recognition) => {
        const candidate = normStr(recognition.name);
        return candidate.includes(target) || target.includes(candidate);
      });
      if (partial.length === 1) matches = partial;
      else if (partial.length > 1) {
        choices.push({
          field: 'reconocimiento',
          value: name,
          options: partial.slice(0, 10).map((recognition) => ({ id: recognition.code, label: recognition.name })),
        });
        continue;
      }
    }
    if (matches.length === 0) {
      blockers.push(`reconocimiento: "${name}" no existe en el catálogo de reconocimientos registrados de CvLAC`);
      continue;
    }
    const recognition = matches[0];
    if (seen.has(recognition.code)) {
      warnings.push(`reconocimientos: se ignoró el reconocimiento repetido "${name}"`);
      continue;
    }
    seen.add(recognition.code);
    desired.push(recognition);
  }
  return { current, desired };
}

async function setRecognitionList(
  page: Page,
  recognitionUrl: string,
  desired: RecognitionValue[]
): Promise<RecognitionValue[]> {
  await navigate(page, recognitionUrl);
  await page.evaluate((recognitions) => {
    const select = document.querySelector<HTMLSelectElement>('#lista_reconocimiento');
    if (!select) throw new Error('CvLAC no mostró la lista de reconocimientos');
    select.innerHTML = '';
    recognitions.forEach((recognition, index) => {
      // CvLAC's formSumbit() adds `${index + 1}.` immediately before posting.
      // Keep the option value as the raw catalogue code or it gets double-prefixed.
      const option = new Option(`${index + 1}. ${recognition.name}`, recognition.code);
      option.selected = true;
      select.add(option);
    });
  }, desired);
  await submitAndWait(page, 'input[name="action"][value="Aceptar"]');
  await navigate(page, recognitionUrl);
  return readRecognitionState(page);
}

async function readStudentState(page: Page, studentUrl: string): Promise<StudentState> {
  const query = new URL(studentUrl).searchParams;
  const productId = query.get('cod_producto') ?? '';
  const productType = query.get('cod_tipo_producto') ?? '';
  const apiUrl = `${BASE_URL}/cvlac/json/ReProductoRecursoHumano/buscar.do?cod_producto=${encodeURIComponent(productId)}&cod_tipo_producto=${encodeURIComponent(productType)}`;
  const response = await page.evaluate(async (url) => {
    const res = await fetch(url, { credentials: 'include' });
    const text = new TextDecoder('latin1').decode(await res.arrayBuffer());
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body };
  }, apiUrl);
  if (!response.ok || !response.body) throw new Error(`CvLAC no devolvió las personas vinculadas (${response.status})`);
  return parseStudentResponse(response.body);
}

async function searchPeople(page: Page, name: string): Promise<PersonValue[]> {
  const url = `${BASE_URL}/cvlac/json/EnRecursoHumano/buscar.do?identificacion=&nombres=${encodeURIComponent(name)}`;
  const response = await page.evaluate(async (fetchUrl) => {
    const res = await fetch(fetchUrl, { credentials: 'include' });
    const text = new TextDecoder('latin1').decode(await res.arrayBuffer());
    try {
      return { ok: res.ok, status: res.status, body: JSON.parse(text) as unknown };
    } catch {
      return { ok: res.ok, status: res.status, body: null };
    }
  }, url);
  if (!response.ok || !Array.isArray(response.body)) return [];
  return response.body
    .map((person) => {
      const row = person as { codRh?: string; txtTotalNames?: string };
      return { code: String(row.codRh ?? '').trim(), name: String(row.txtTotalNames ?? '').replace(/\s+/g, ' ').trim() };
    })
    .filter((person) => person.code && person.name);
}

function resolveParticipation(value: string | undefined, types: Record<string, string>): { code: string; name: string } | null {
  const wanted = normStr(value ?? 'ORI');
  const match = Object.entries(types).find(([code, name]) => normStr(code) === wanted || normStr(name) === wanted);
  return match ? { code: match[0], name: match[1] } : null;
}

async function resolveStudents(
  page: Page,
  studentUrl: string,
  wanted: ProductStudentInput[],
  choices: AmbiguousChoice[],
  blockers: string[],
  warnings: string[]
): Promise<{ current: StudentValue[]; desired: StudentValue[] }> {
  const state = await readStudentState(page, studentUrl);
  const desired: StudentValue[] = [];
  const seen = new Set<string>();
  const owner = state.students.find((student) => student.code === '0');
  if (owner) {
    desired.push(owner);
    seen.add(owner.code);
  }
  for (const input of wanted) {
    const name = input.name.trim();
    const participation = resolveParticipation(input.participation, state.types);
    if (!participation) {
      blockers.push(`estudiante: participación "${input.participation}" no es válida (${Object.keys(state.types).join(', ')})`);
      continue;
    }
    let person: PersonValue | undefined;
    if (input.personId) {
      person = { code: input.personId, name };
    } else {
      const candidates = await searchPeople(page, name);
      const exact = candidates.filter((candidate) => normStr(candidate.name) === normStr(name));
      if (exact.length === 1) person = exact[0];
      else if (exact.length > 1 || candidates.length > 1) {
        const options = (exact.length ? exact : candidates).slice(0, 10);
        choices.push({ field: 'estudiante', value: name, options: options.map((candidate) => ({ id: candidate.code, label: candidate.name })) });
        continue;
      }
    }
    if (!person) {
      blockers.push(`estudiante: "${name}" no se encontró en el catálogo de personas de CvLAC`);
      continue;
    }
    if (seen.has(person.code)) {
      warnings.push(`estudiantes: se ignoró la persona repetida "${name}"`);
      continue;
    }
    seen.add(person.code);
    desired.push({ ...person, participation: participation.code, participationName: participation.name });
  }
  return { current: state.students, desired };
}

async function studentMutation(
  page: Page,
  action: 'insert' | 'update' | 'delete',
  productId: string,
  personId: string,
  participation?: string
): Promise<void> {
  const url = new URL(`${BASE_URL}/cvlac/json/ReProductoRecursoHumano/${action}.do`);
  url.searchParams.set('cod_producto', productId);
  url.searchParams.set('cod_rh_otro', personId);
  if (participation) url.searchParams.set('tpo_participacion', participation);
  const response = await page.evaluate(async (fetchUrl) => {
    const res = await fetch(fetchUrl, { credentials: 'include' });
    return { ok: res.ok, status: res.status, text: (await res.text()).slice(0, 300) };
  }, url.toString());
  if (!response.ok) throw new Error(`CvLAC rechazó ${action} de la persona (${response.status})`);
}

function sameStudents(left: StudentValue[], right: StudentValue[]): boolean {
  const key = (student: StudentValue): string => `${student.code}|${student.participation}`;
  const a = left.map(key).sort();
  const b = right.map(key).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function setStudentList(page: Page, studentUrl: string, current: StudentValue[], desired: StudentValue[]): Promise<StudentState> {
  const productId = new URL(studentUrl).searchParams.get('cod_producto') ?? '';
  const currentByCode = new Map(current.map((student) => [student.code, student]));
  const desiredByCode = new Map(desired.map((student) => [student.code, student]));
  // Add/update first. If CvLAC rejects a new link, the existing list remains
  // intact and can still be repaired; deleting first made this operation
  // irreversible halfway through.
  for (const student of desired) {
    if (student.code === '0') continue;
    const existing = currentByCode.get(student.code);
    if (!existing) await studentMutation(page, 'insert', productId, student.code, student.participation);
    else if (existing.participation !== student.participation) {
      await studentMutation(page, 'update', productId, student.code, student.participation);
    }
  }
  for (const student of current) {
    if (student.code !== '0' && !desiredByCode.has(student.code)) {
      await studentMutation(page, 'delete', productId, student.code);
    }
  }
  return readStudentState(page, studentUrl);
}

async function submitAndWait(page: Page, selector: string): Promise<void> {
  await page.locator(selector).click();
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
}

async function openKeywordPage(page: Page, keywordUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await navigate(page, keywordUrl);
    if ((await page.locator('select[name="cod_palabra_clave"]').count()) > 0) return;
    if (attempt < 2) await page.waitForTimeout(1200 * (attempt + 1));
  }
  throw new Error(`CvLAC no mostró la lista de palabras clave en ${keywordUrl}`);
}

async function createKeyword(page: Page, keywordUrl: string, name: string): Promise<void> {
  await page.locator('#insertarPalabra').evaluate(
    (form, value) => {
      const input = form.querySelector<HTMLInputElement>('input[name="txt_nme_palabra_clave"]');
      if (!input) throw new Error('CvLAC no mostró el campo para crear una palabra clave');
      input.value = value as string;
      HTMLFormElement.prototype.submit.call(form);
    },
    name
  );
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await openKeywordPage(page, keywordUrl);
}

async function resolveKeywords(
  page: Page,
  keywordUrl: string,
  wanted: string[],
  warnings: string[]
): Promise<{ state: KeywordState; desired: KeywordValue[]; missing: string[] }> {
  await openKeywordPage(page, keywordUrl);
  let state = await readKeywordState(page);
  const desired: KeywordValue[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const raw of wanted) {
    const name = raw.trim();
    const key = normStr(name);
    if (!key) {
      warnings.push('keywords: se ignoró una palabra clave vacía');
      continue;
    }
    if (seen.has(key)) {
      warnings.push(`keywords: se ignoró la palabra repetida "${name}"`);
      continue;
    }
    seen.add(key);
    let item = [...state.personal, ...state.selected].find((candidate) => normStr(candidate.name) === key);
    if (!item) {
      missing.push(name);
      warnings.push(`keywords: "${name}" no existe en el catálogo personal; se crearía desde CvLAC`);
      continue;
    }
    desired.push(item);
  }

  return { state, desired, missing };
}

async function setKeywordList(page: Page, keywordUrl: string, desired: KeywordValue[]): Promise<KeywordState> {
  await openKeywordPage(page, keywordUrl);
  await page.evaluate((items) => {
    const select = document.querySelector<HTMLSelectElement>('select[name="cod_palabra_clave"]');
    if (!select) throw new Error('CvLAC no mostró la lista de palabras clave');
    select.innerHTML = '';
    items.forEach((item, index) => {
      const option = new Option(`${index + 1}. ${item.name}`, `${index}.${item.code}`);
      option.selected = true;
      select.add(option);
    });
  }, desired);
  await submitAndWait(page, 'form[name="reTrayectoriaEscPalabraClaUpdateForm"] input[type="button"]');
  await openKeywordPage(page, keywordUrl);
  return readKeywordState(page);
}

async function resolveAreas(
  page: Page,
  areaUrl: string,
  wanted: string[],
  choices: AmbiguousChoice[],
  blockers: string[]
): Promise<{ current: Area[]; desired: ResolvedArea[] }> {
  await navigate(page, areaUrl);
  const current = await readAreas(page);
  const areaQuery = new URL(areaUrl).searchParams;
  const codRh = areaQuery.get('cod_rh') ?? '';
  const cataloguePage = await session.getPage();
  let catalogue: CatalogueArea[] = [];
  try {
    await navigate(
      cataloguePage,
      `${BASE_URL}/cvlac/popup/ReProductoAreaCon/areaAll.do?cod_rh=${encodeURIComponent(codRh)}&pro=false`
    );
    catalogue = await readAreaCatalogue(cataloguePage);
  } finally {
    await cataloguePage.close();
  }

  const desired: ResolvedArea[] = [];
  const seen = new Set<string>();
  for (const raw of wanted) {
    const name = raw.trim();
    const key = normStr(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    let pick = resolveProductArea(catalogue, name);
    if (pick.kind === 'none') {
      const paths = catalogue.filter(
        (area) => area.level >= 2 && normStr(productAreaLabel(catalogue, area)) === key
      );
      if (paths.length === 1) pick = { kind: 'exact', item: paths[0] };
      else if (paths.length > 1) pick = { kind: 'ambiguous', options: paths };
    }
    if (pick.kind === 'none') {
      blockers.push(`área de conocimiento: "${name}" no es una disciplina o especialidad del catálogo de CvLAC`);
      continue;
    }
    if (pick.kind === 'ambiguous') {
      choices.push({
        field: 'área de conocimiento',
        value: name,
        options: pick.options.map((area) => ({ id: area.code, label: productAreaLabel(catalogue, area) })),
      });
      continue;
    }
    desired.push({ code: pick.item.code, name: pick.item.name, label: productAreaLabel(catalogue, pick.item) });
  }
  return { current, desired };
}

async function setAreaList(page: Page, areaUrl: string, desired: ResolvedArea[]): Promise<Area[]> {
  await navigate(page, areaUrl);
  await applyAreas(page, desired);
  await submitAndWait(page, 'form[name="reProductoAreaConUpdateForm"] input[type="button"]');
  await navigate(page, areaUrl);
  return readAreas(page);
}

function confirmation(message: string, removed: string[]): UpdateResult {
  return { success: false, status: 'needs_confirmation', message, removed };
}

export async function completeProductTool(req: CompleteProductRequest): Promise<UpdateResult> {
  if (
    req.keywords === undefined &&
    req.areas === undefined &&
    req.coauthors === undefined &&
    req.recognitions === undefined &&
    req.students === undefined
  ) {
    return {
      success: false,
      status: 'failed',
      message: 'Pasa keywords, areas, coauthors, recognitions, students o una combinación; no hay nada que completar.',
    };
  }

  const cfg = (PRODUCT_SECTIONS as Record<ProductCompletionSection, SectionConfig>)[req.section];
  if (!cfg) {
    return { success: false, status: 'failed', message: `Section "${req.section}" not supported for completion` };
  }

  await session.login();
  const page = await session.getPage();
  const warnings: string[] = [];
  const choices: AmbiguousChoice[] = [];
  const blockers: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  try {
    const row = await lookupRow({ page }, cfg, req.label, 'Detalles');
    if (row.kind === 'many') {
      return {
        success: false,
        status: 'needs_confirmation',
        message: `${row.labels.length} filas coinciden con "${req.label}" y no se completó ninguna.`,
        similar: row.labels.map((label) => ({ label, matchType: 'similar' as const })),
      };
    }
    if (row.kind !== 'found' || !row.href) {
      return { success: false, status: 'failed', message: `No existing item matching "${req.label}" to complete` };
    }

    await navigate(page, absolute(row.href));
    const phaseUrls: Partial<Record<Phase, string>> = {};
    for (const phase of ['keywords', 'areas', 'coauthors', 'recognitions', 'students'] as const) {
      const url = await phaseUrl(page, phase);
      if (url) phaseUrls[phase] = url;
    }

    let keywordPlan: { url: string; state: KeywordState; desired: KeywordValue[]; missing: string[] } | undefined;
    if (req.keywords !== undefined) {
      if (!phaseUrls.keywords) blockers.push('CvLAC no mostró la acción para registrar palabras clave');
      else {
        const plan = await resolveKeywords(page, phaseUrls.keywords, req.keywords, warnings);
        keywordPlan = { url: phaseUrls.keywords, ...plan };
        removed.push(...removedValues(plan.state.selected, plan.desired).map((name) => `palabra clave: ${name}`));
      }
    }

    let areaPlan: { url: string; current: Area[]; desired: ResolvedArea[] } | undefined;
    if (req.areas !== undefined) {
      if (!phaseUrls.areas) blockers.push('CvLAC no mostró la acción para registrar áreas de conocimiento');
      else {
        const plan = await resolveAreas(page, phaseUrls.areas, req.areas, choices, blockers);
        areaPlan = { url: phaseUrls.areas, ...plan };
        removed.push(...removedValues(plan.current, plan.desired).map((name) => `área: ${name}`));
      }
    }

    let coauthorPlan: { url: string; current: PersonValue[]; desired: PersonValue[] } | undefined;
    if (req.coauthors !== undefined) {
      if (!phaseUrls.coauthors) blockers.push('CvLAC no mostró la acción para registrar coautores');
      else {
        const plan = await resolveCoauthors(page, phaseUrls.coauthors, req.coauthors, choices, blockers, warnings);
        coauthorPlan = { url: phaseUrls.coauthors, ...plan };
        removed.push(...removedValues(plan.current, plan.desired).map((name) => `coautor: ${name}`));
      }
    }

    let recognitionPlan: { url: string; current: RecognitionValue[]; desired: RecognitionValue[] } | undefined;
    if (req.recognitions !== undefined) {
      if (!phaseUrls.recognitions) blockers.push('CvLAC no mostró la acción para registrar reconocimientos');
      else {
        const plan = await resolveRecognitions(
          page,
          phaseUrls.recognitions,
          req.recognitions,
          choices,
          blockers,
          warnings
        );
        recognitionPlan = { url: phaseUrls.recognitions, ...plan };
        removed.push(...removedValues(plan.current, plan.desired).map((name) => `reconocimiento: ${name}`));
      }
    }

    let studentPlan: { url: string; current: StudentValue[]; desired: StudentValue[] } | undefined;
    if (req.students !== undefined) {
      if (req.section !== 'tesis') blockers.push('students solo está disponible para productos de tesis');
      else if (!phaseUrls.students) blockers.push('CvLAC no mostró la acción para registrar personas vinculadas');
      else {
        const plan = await resolveStudents(page, phaseUrls.students, req.students, choices, blockers, warnings);
        studentPlan = { url: phaseUrls.students, ...plan };
        removed.push(...
          plan.current
            .filter((student) => student.code !== '0' && !plan.desired.some((wanted) => wanted.code === student.code))
            .map((student) => `estudiante: ${student.name}`)
        );
      }
    }

    if (choices.length) return { success: false, status: 'needs_confirmation', message: 'CvLAC encontró varias opciones; elige una antes de escribir.', choices };
    if (blockers.length) return { success: false, status: 'failed', message: blockers.join(' | '), warnings: warnings.length ? warnings : undefined };
    if (removed.length && req.confirmDelete !== true) {
      return confirmation(
        `Completar "${req.label}" quitaría ${removed.length} valor(es) existentes. Repite con confirm_delete:true para reemplazar las listas completas.`,
        removed
      );
    }
    if (req.dryRun) {
      return {
        success: true,
        status: 'ok',
        message: `Dry run: se puede completar "${req.label}" sin escribir.`,
        warnings: [...warnings, ...(removed.length ? [`Se quitarían: ${removed.join('; ')}`] : [])],
        removed: removed.length ? removed : undefined,
      };
    }

    if (keywordPlan && keywordPlan.missing.length) {
      for (const name of keywordPlan.missing) {
        await createKeyword(page, keywordPlan.url, name);
      }
      const refreshed = await readKeywordState(page);
      const byName = new Map([...refreshed.personal, ...refreshed.selected].map((item) => [normStr(item.name), item]));
      const created = keywordPlan.missing.map((name) => byName.get(normStr(name))).filter(Boolean) as KeywordValue[];
      if (created.length !== keywordPlan.missing.length) {
        return {
          success: false,
          status: 'failed',
          message: `CvLAC no confirmó la creación de: ${keywordPlan.missing.join(', ')}`,
          warnings,
        };
      }
      keywordPlan.desired.push(...created);
      keywordPlan.state = refreshed;
    }
    if (keywordPlan && !sameOrderedCodes(keywordPlan.state.selected, keywordPlan.desired)) {
      const stored = await setKeywordList(page, keywordPlan.url, keywordPlan.desired);
      if (!sameOrderedCodes(stored.selected, keywordPlan.desired)) {
        return { success: false, status: 'failed', message: `CvLAC no confirmó las palabras clave de "${req.label}"`, warnings };
      }
      changed.push('palabras clave');
    }
    if (areaPlan && !sameOrderedCodes(areaPlan.current, areaPlan.desired)) {
      const stored = await setAreaList(page, areaPlan.url, areaPlan.desired);
      if (!sameOrderedCodes(stored, areaPlan.desired)) {
        return { success: false, status: 'failed', message: `CvLAC no confirmó las áreas de "${req.label}"`, warnings };
      }
      changed.push('áreas de conocimiento');
    }
    if (coauthorPlan && !sameOrderedCodes(coauthorPlan.current, coauthorPlan.desired)) {
      const stored = await setCoauthorList(page, coauthorPlan.url, coauthorPlan.desired);
      if (!sameOrderedCodes(stored, coauthorPlan.desired)) {
        return { success: false, status: 'failed', message: `CvLAC no confirmó los coautores de "${req.label}"`, warnings };
      }
      changed.push('coautores');
    }
    if (recognitionPlan && !sameOrderedCodes(recognitionPlan.current, recognitionPlan.desired)) {
      const stored = await setRecognitionList(page, recognitionPlan.url, recognitionPlan.desired);
      if (!sameOrderedCodes(stored, recognitionPlan.desired)) {
        return {
          success: false,
          status: 'failed',
          message: `CvLAC no confirmó los reconocimientos de "${req.label}"`,
          warnings,
        };
      }
      changed.push('reconocimientos');
    }
    if (studentPlan && !sameStudents(studentPlan.current, studentPlan.desired)) {
      const stored = await setStudentList(page, studentPlan.url, studentPlan.current, studentPlan.desired);
      if (!sameStudents(stored.students, studentPlan.desired)) {
        return { success: false, status: 'failed', message: `CvLAC no confirmó los estudiantes de "${req.label}"`, warnings };
      }
      changed.push('estudiantes');
    }

    log.info('product completion applied', { section: req.section, label: req.label, changed });
    return {
      success: true,
      status: 'ok',
      message: changed.length ? `Completed: ${req.label} (${changed.join(', ')})` : `Already complete: ${req.label}`,
      warnings: warnings.length ? warnings : undefined,
      removed: removed.length ? removed : undefined,
      screenshotBase64: await session.takeScreenshot(page).catch(() => undefined),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
    log.error('product completion failed', { section: req.section, label: req.label, error: detail });
    return {
      success: false,
      status: 'failed',
      message: `No se pudo completar "${req.label}": ${detail}`,
      warnings: warnings.length ? warnings : undefined,
    };
  } finally {
    await page.close();
  }
}
