import type { Page } from 'playwright';
import { BASE_URL } from '../browser/navigation.js';
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

type Phase = 'keywords' | 'coauthors' | 'areas' | 'recognitions';

interface KeywordValue {
  code: string;
  name: string;
}

interface KeywordState {
  selected: KeywordValue[];
  personal: KeywordValue[];
}

interface ResolvedArea extends Area {
  label: string;
}

function absolute(href: string): string {
  return new URL(href, BASE_URL).toString();
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
  const patterns: Record<Phase, RegExp> = {
    keywords: /palabra/i,
    coauthors: /coautor/i,
    areas: /gran área|area y disciplina|área y disciplina/i,
    recognitions: /reconocimiento/i,
  };
  return page.evaluate((patternSource) => {
    const pattern = new RegExp(patternSource, 'i');
    const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('a')).find((candidate) =>
      pattern.test(candidate.textContent ?? '')
    );
    if (!link) return null;
    const onclick = link.getAttribute('onclick') ?? '';
    const quoted = onclick.match(/['"](\/cvlac\/[^'"]+?\.do\?[^'"]*)['"]/);
    if (quoted) return quoted[1];
    return null;
  }, patterns[phase].source).then((url) => (url ? absolute(url) : null));
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
  dryRun: boolean,
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
    if (!item && !dryRun) {
      await createKeyword(page, keywordUrl, name);
      state = await readKeywordState(page);
      item = [...state.personal, ...state.selected].find((candidate) => normStr(candidate.name) === key);
    }
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
  if (req.keywords === undefined && req.areas === undefined) {
    return {
      success: false,
      status: 'failed',
      message: 'Pasa keywords, areas o ambos; no hay nada que completar.',
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
    for (const phase of ['keywords', 'areas'] as const) {
      const url = await phaseUrl(page, phase);
      if (url) phaseUrls[phase] = url;
    }

    let keywordPlan: { url: string; state: KeywordState; desired: KeywordValue[]; missing: string[] } | undefined;
    if (req.keywords !== undefined) {
      if (!phaseUrls.keywords) blockers.push('CvLAC no mostró la acción para registrar palabras clave');
      else {
        const plan = await resolveKeywords(page, phaseUrls.keywords, req.keywords, req.dryRun === true, warnings);
        keywordPlan = { url: phaseUrls.keywords, ...plan };
        if (plan.missing.length && !req.dryRun) {
          blockers.push(`keywords: CvLAC no confirmó la creación de: ${plan.missing.join(', ')}`);
        }
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
