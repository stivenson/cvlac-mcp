import type { Page } from 'playwright';
import { session, isLoginPage } from '../browser/session.js';
import type {
  UpdateRequest,
  UpdateResult,
  CvLACSectionName,
  SimilarCandidate,
  EducationItem,
  ExperienceItem,
  CourseItem,
  AchievementItem,
  ProjectItem,
  SoftwareItem,
  EventoCientificoItem,
  LanguageInput,
  ResearchLineInput,
} from '../types.js';
import { BASE_URL, URLS, SECTION_LIST } from '../browser/navigation.js';
import { navigate } from '../browser/navigate.js';
import {
  catalogueQuery,
  countryOption,
  cvlacDateString,
  projectValueApplies,
  municipioDisplayName,
  parseDepartamentosXml,
  parseMunicipiosXml,
  pickByName,
  needsProgramaAcademico,
  parseProgramaOptions,
  pickMunicipio,
  pickPrograma,
  type CatalogueOption,
  type MunicipioRow,
} from '../browser/catalogue.js';
import {
  changedFields,
  classifySubmit,
  disagreeingFields,
  isOutageMarkup,
  verifiableFields,
  verificationVerdict,
  deleteConfirmation,
  noChangeRefusal,
  undeletableRefusal,
  isServerErrorMarkup,
  blockedRefusal,
} from './write-verdict.js';
import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { classifyMatch } from '../diff.js';

const log = createLogger('update-section');

/**
 * How long to wait for one field. Playwright's default is 30s, which a form
 * that hides a section turns into half a minute of waiting per hidden input.
 */
const FIELD_TIMEOUT_MS = 5000;

/**
 * Fields that could not be filled during one form submission.
 *
 * CvLAC rejects a form without saying which control was at fault, so every
 * skipped field is recorded here and returned to the caller alongside whatever
 * the server itself complained about.
 */
interface FillReport {
  warnings: string[];
  /**
   * Fields CvLAC requires that could not be filled. A form carrying one is not
   * submitted: doing so crashed CvLAC's own validator rather than coming back
   * with a message.
   */
  blockers?: string[];
}

/**
 * Runs one field interaction, recording a warning instead of aborting.
 *
 * Fillers touch fields that only exist on some CvLAC forms, so a missing control
 * is normal — but it must never be invisible, which is what the old
 * `.catch(() => {})` made it.
 */
async function tryField(report: FillReport, field: string, fn: () => Promise<unknown>): Promise<boolean> {
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

/** Records that a value was unavailable, without touching the page. */
function missingValue(report: FillReport, field: string, hint: string): void {
  report.warnings.push(`${field}: sin valor (${hint})`);
  log.debug('field left empty', { field, hint });
}

/** Normalize string for fuzzy comparison: lowercase, no accents, no punctuation */
function normStr(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Search the CvLAC institution catalogue.
 *
 * Returns null when nothing matches: writing id 0 would save an entry pointing at
 * a non-existent institution, which is worse than letting the form reject it.
 */
async function findInstitucionId(page: Page, name: string): Promise<{ id: number; nme: string } | null> {
  // Try progressively shorter search terms: full name, then each word (longest first)
  const searchTerms = [name, ...name.split(/\s+/).filter((w) => w.length > 4).sort((a, b) => b.length - a.length)];

  for (const term of searchTerms) {
    const url = `${BASE_URL}/cvlac/json/EnInstitucion/buscar.do?txt_nombre=${encodeURIComponent(catalogueQuery(term))}`;

    const response = await page.evaluate(async (fetchUrl: string) => {
      const res = await fetch(fetchUrl, { credentials: 'include' });
      if (!res.ok) return { ok: false, items: [] as unknown[] };
      const buf = await res.arrayBuffer();
      const text = new TextDecoder('latin1').decode(buf);
      try {
        return { ok: true, items: JSON.parse(text) };
      } catch {
        return { ok: true, items: [] };
      }
    }, url);

    if (!response.ok) return null;

    const items = response.items as Array<{ id: number; nmeInst: string }>;
    if (!Array.isArray(items) || items.length === 0) continue;

    const normQuery = normStr(name);

    const exact = items.find((r) => normStr(r.nmeInst) === normQuery);
    if (exact) return { id: exact.id, nme: exact.nmeInst };

    const partial = items.find((r) => {
      const n = normStr(r.nmeInst);
      return n.includes(normQuery) || normQuery.includes(n);
    });
    if (partial) return { id: partial.id, nme: partial.nmeInst };

    return null;
  }

  return null;
}

/** Set a readonly institution picker (hidden id + visible readonly name) using the search API */
async function setInstitucionFields(
  page: Page,
  report: FillReport,
  name: string,
  idField: string,
  nmeField: string
): Promise<void> {
  const found = await findInstitucionId(page, name);
  if (!found) {
    report.warnings.push(
      `institución "${name}": no existe en el catálogo de CvLAC; el campo queda vacío`
    );
    log.warn('institution not found in CvLAC catalogue', { name });
    return;
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
    { instId: found.id, instNme: found.nme, idF: idField, nmeF: nmeField }
  );
}

/**
 * Resolves a municipality the way the picker popup does.
 *
 * Three numberings exist and only one is the code the form stores: the DANE
 * code wrote Sketty (Wales), the id from the JSON search wrote Neiva, and this
 * cascade — country, department, municipality — writes Cúcuta. The JSON search
 * is still the cheapest way to learn which department a town belongs to, so it
 * is used for that and nothing else.
 */
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
  let hit: { txtNmeMunicipio: string; departamento?: { txtNmeDepartamento?: string; pais?: { txtNmePais?: string } } } | null =
    null;
  try {
    const rows = JSON.parse(raw);
    hit = Array.isArray(rows) ? pickMunicipio(rows as MunicipioRow[], name) : null;
  } catch {
    hit = null;
  }
  if (!hit) return null;

  const paisNombre = hit.departamento?.pais?.txtNmePais ?? 'Colombia';
  const deptoNombre = hit.departamento?.txtNmeDepartamento ?? null;
  // The cascade speaks three-letter country codes; the JSON returns two.
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

/**
 * Finds the programme among those the institution registered at that level.
 *
 * Mirrors the popup `selectPrograma()` opens, including the quirk that CvLAC
 * stores the whole `rhCode-programmeCode` string in `cod_rh_prog_acad`: its own
 * script means to split it but looks the second field up with an empty selector,
 * so the split never runs. Submitting what a browser would submit keeps this
 * server on the path the server accepts.
 */
async function findPrograma(
  page: Page,
  params: { institucionId: string; institucionNombre: string; nivel: string; degree: string }
): Promise<CatalogueOption | null> {
  const query =
    `__form=enTrayectoriaEscolarInsertForm&__text=txt_nme_programa_acad&__value=cod_rh_prog_acad` +
    `&id_institucion=${encodeURIComponent(params.institucionId)}` +
    `&txt_nme_inst=${encodeURIComponent(catalogueQuery(params.institucionNombre))}` +
    `&cod_nivel_formacion=${encodeURIComponent(params.nivel)}&isTrayectoria=TE`;
  const url = `${BASE_URL}/cvlac/EnProgramaAcademico/queryPrograma.do?${query}`;

  const html = await page.evaluate(
    async ({ fetchUrl, degree }: { fetchUrl: string; degree: string }) => {
      const res = await fetch(fetchUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'txt_nme_programa_acad=' + encodeURIComponent(degree),
      });
      if (!res.ok) return '';
      return new TextDecoder('latin1').decode(await res.arrayBuffer());
    },
    { fetchUrl: url, degree: catalogueQuery(params.degree) }
  );

  return pickPrograma(parseProgramaOptions(html), params.degree);
}

/** Fills the programme picker, or says why it could not. */
async function setProgramaAcademico(
  page: Page,
  report: FillReport,
  nivel: string,
  degree: string
): Promise<void> {
  const institucionId = await page
    .evaluate(() => (document.getElementById('id_institucion') as HTMLInputElement | null)?.value ?? '')
    .catch(() => '');
  const institucionNombre = await page
    .evaluate(
      () => (document.getElementById('txt_nme_institucion') as HTMLInputElement | null)?.value ?? ''
    )
    .catch(() => '');

  if (!institucionId) {
    (report.blockers ??= []).push(
      'programa académico: CvLAC lo busca dentro de una institución y la institución quedó sin resolver'
    );
    return;
  }

  const programa = await findPrograma(page, { institucionId, institucionNombre, nivel, degree });
  if (!programa) {
    (report.blockers ??= []).push(
      `programa académico: "${degree}" no está entre los programas que ${institucionNombre || 'esa institución'} ` +
        'tiene registrados en ese nivel; CvLAC exige elegir uno de su catálogo'
    );
    await setReadonlyField(page, report, 'txt_nme_programa_acad', degree, true);
    return;
  }

  await setReadonlyField(page, report, 'txt_nme_programa_acad', programa.label, true);
  await tryField(report, 'cod_rh_prog_acad', () =>
    page.evaluate((value: string) => {
      const el = document.getElementById('cod_rh_prog_acad') as HTMLInputElement | null;
      if (!el) throw new Error('el formulario no tiene cod_rh_prog_acad');
      el.value = value;
    }, programa.value)
  );
  log.info('programa académico resolved', { degree, matched: programa.label });
}

/** Default institution picker used by formación / eventos (id_institucion + txt_nme_institucion) */
async function setInstitucion(page: Page, report: FillReport, name: string): Promise<void> {
  await setInstitucionFields(page, report, name, 'id_institucion', 'txt_nme_institucion');
}

/**
 * Fills the municipality picker: a readonly text input plus a hidden code whose
 * id carries a per-render suffix (_loc_NNNNN / _locValue_NNNNN).
 */
async function setMunicipio(
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
    report.warnings.push(
      `municipio "${nombre}": no se pudo resolver en el catálogo de CvLAC; el campo queda vacío`
    );
    log.warn('municipality not resolved', { nombre });
    return;
  }
  if (codigoDane && codigoDane !== found.codMunicipio) {
    report.warnings.push(
      `municipio: se ignoró el código ${codigoDane} porque CvLAC numera sus municipios aparte del DANE ` +
        `(${found.text} es ${found.codMunicipio} para el formulario)`
    );
  }

  // The picker writes four fields, not one: the readable path, the code, the
  // 10-character prefix beside it and the country.
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

      for (const el of Array.from(
        document.querySelectorAll('input[name="cod_municipio"]')
      ) as HTMLInputElement[]) {
        el.value = code;
      }
      for (const el of Array.from(
        document.querySelectorAll('input[name="cod_rh_municipio"]')
      ) as HTMLInputElement[]) {
        el.value = codRh;
      }
      return true;
    },
    { text: found.text, code: found.codMunicipio, codRh: found.codRh, sglPais: found.sglPais }
  );
  if (!applied) report.warnings.push('municipio: el formulario no tiene cod_municipio_text');
}

/** Remove readonly from any field and set its value via JS. False when the field is absent. */
async function forceSetReadonly(page: Page, fieldId: string, value: string): Promise<boolean> {
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

/** Set a readonly field selected by name attribute (some forms have no id) */
async function forceSetReadonlyByName(page: Page, fieldName: string, value: string): Promise<boolean> {
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

/** forceSetReadonly + warning when the field is not on this form. */
async function setReadonlyField(
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

/** Random delay to simulate human behaviour */
async function humanDelay(min = 300, max = 800): Promise<void> {
  const ms = min + Math.random() * (max - min);
  await new Promise((r) => setTimeout(r, ms));
}

/** Navigate to a URL; throws SessionExpiredError if redirected to login (caller must reopen page) */
class SessionExpiredError extends Error {}

interface GotoOptions {
  /** Let a 5xx through, for actions whose outcome is confirmed elsewhere. */
  tolerateUnavailable?: boolean;
}

async function gotoForm(page: Page, url: string, opts: GotoOptions = {}): Promise<number | null> {
  const { status } = await navigate(page, url, { tolerateUnavailable: opts.tolerateUnavailable });
  if (await isLoginPage(page)) {
    throw new SessionExpiredError('Session expired');
  }
  return status;
}

/** Navigate with automatic re-login: closes old page, re-logins, opens new page, retries once */
async function gotoFormWithRelogin(
  pageRef: { page: Page },
  url: string,
  opts: GotoOptions = {}
): Promise<number | null> {
  try {
    return await gotoForm(pageRef.page, url, opts);
  } catch (err) {
    if (!(err instanceof SessionExpiredError)) throw err;
    log.info('session expired mid-run; re-logging in', { url });
    await pageRef.page.close();
    await session.login(true);
    pageRef.page = await session.getPage();
    const { status } = await navigate(pageRef.page, url, {
      tolerateUnavailable: opts.tolerateUnavailable,
    });
    if (await isLoginPage(pageRef.page)) {
      throw new Error('Session expired and re-login failed');
    }
    return status;
  }
}

/** Click the form's save button and wait for the navigation it triggers */
export async function clickGuardar(page: Page): Promise<void> {
  const btn = page.getByRole('button', { name: /guardar|aceptar|enviar|save/i });
  await btn.waitFor({ timeout: 10000 });
  await btn.click();
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Pulls validation messages out of a rejected CvLAC form.
 *
 * The app is classic Struts: errors land in a red-styled block near the top and,
 * on some forms, next to the offending control. Selectors are deliberately broad
 * because the markup is inconsistent across sections.
 */
export async function readFormErrors(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selectors = [
      '.error',
      '.errors',
      '.mensajeError',
      '.msgError',
      'span.error',
      'div[class*="error" i]',
      'font[color="red"]',
      'font[color="#FF0000"]',
      '[style*="color: red" i]',
      // Only actual reds. "color:#f" also matched the white (#fff) footer, which
      // put "Política de seguridad de la información" on every rejection.
      '[style*="color:#f00" i]',
      '[style*="color:#ff0000" i]',
      '[style*="color: #f00" i]',
      '[style*="color: #ff0000" i]',
    ];
    const seen = new Set<string>();
    for (const sel of selectors) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        // Validation messages are text. Anything built out of links is site
        // furniture — the footer, the site map — however it happens to be styled.
        if (el.tagName === 'A' || el.querySelector('a')) continue;
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        // Long blocks are usually the whole page, not a message.
        if (text.length > 3 && text.length < 300) seen.add(text);
      }
    }
    return Array.from(seen).slice(0, 10);
  });
}

/**
 * Every named value the form currently holds.
 *
 * Read from a freshly loaded edit page, this is what CvLAC has stored — which
 * is how a submit that came back to the form without complaining can still be
 * confirmed as saved.
 */
export async function readFormValues(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    const controls = document.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >('input[name], select[name], textarea[name]');

    for (const el of Array.from(controls)) {
      const name = el.getAttribute('name');
      if (!name) continue;

      if (el instanceof HTMLInputElement) {
        const type = (el.getAttribute('type') ?? 'text').toLowerCase();
        // Buttons carry their caption in `value`, which is not data.
        if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image') continue;
        // Only the chosen option of a group counts.
        if ((type === 'radio' || type === 'checkbox') && !el.checked) continue;
      }

      out[name] = el.value ?? '';
    }
    return out;
  });
}

/**
 * The code CvLAC's four language radio groups carry, or null.
 *
 * Its three levels are P/R/B, printed as Deficiente/Aceptable/Bueno. A level it
 * cannot place returns null and the field is left unset with a warning: a
 * guessed proficiency in an official record is worse than a missing one.
 */
export function languageLevel(text: string): 'P' | 'R' | 'B' | null {
  const t = (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
  // Matched whole, not by prefix: "regular tirando a bueno" started with
  // "regular" and was graded Aceptable, which is not what it says.
  const LEVELS: Record<string, 'P' | 'R' | 'B'> = {
    p: 'P', deficiente: 'P', pobre: 'P', bajo: 'P', poor: 'P',
    r: 'R', aceptable: 'R', regular: 'R', medio: 'R', intermedio: 'R', fair: 'R',
    b: 'B', bueno: 'B', buena: 'B', alto: 'B', good: 'B',
  };
  return LEVELS[t] ?? null;
}

/** The word CvLAC prints for a level code. */
export function levelName(code: 'P' | 'R' | 'B'): string {
  return { P: 'Deficiente', R: 'Aceptable', B: 'Bueno' }[code];
}

/** Reads the matchable label of every row in a list page. */
export async function listRowLabels(page: Page, matchCellIndex: number): Promise<string[]> {
  return page.evaluate((idx) => {
    return Array.from(document.querySelectorAll('tr.odd, tr.even'))
      .map((r) => {
        const cells = r.querySelectorAll('td');
        return (cells[idx]?.textContent ?? '').replace(/\s+/g, ' ').trim();
      })
      .filter((s) => s.length > 0);
  }, matchCellIndex);
}

// ── Helpers shared by the form fillers ───────────────────────────────────────

export function inferNivel(degree: string): string {
  const d = degree.toLowerCase();
  if (d.includes('maestría') || d.includes('maestria') || d.includes('master') || d.includes('magister'))
    return '3';
  if (d.includes('doctorado') || d.includes('phd')) return '4';
  if (d.includes('especialización') || d.includes('especializacion') || d.includes('especialidad'))
    return '2';
  if (d.includes('técnico') || d.includes('tecnico')) return '9';
  return '1'; // Pregrado/Universitario
}

export function parsePeriod(period: string): { start: string; end: string } {
  const years = period.match(/\d{4}/g) ?? [];
  return { start: years[0] ?? '', end: years[1] ?? '' };
}

/** Map a free-text participation role to the CvLAC tpo_participacion_proy code */
export function inferParticipacionProy(p?: string): string {
  const s = (p ?? '').toLowerCase();
  if (s.includes('coinvest')) return 'CI';
  if (s.includes('asesor')) return 'AS';
  if (s.includes('doctor')) return 'ED';
  if (s.includes('maestr')) return 'EM';
  if (s.includes('pregrado') || s.includes('estudiante')) return 'EP';
  return 'IP'; // Investigador principal (default)
}

// ── Per-section form fillers (work for both create.do and edit.do) ────────────


/**
 * The level code of *formación complementaria*, which is a different catalogue.
 *
 * The section runs on the same module as formación académica — the list is the
 * only part under EnFormacionComple — but its `cod_nivel_formacion` offers only
 * `Y` Otros, `8` Extensión, `F` Cursos de corta duración and `E` MBA. Reusing
 * `inferNivel` here would send a code (1 Pregrado, 3 Maestría…) the form does
 * not carry.
 *
 * `Y` is the fallback because it is CvLAC's own catch-all, not a guess.
 */
export function inferNivelComple(name: string): 'Y' | '8' | 'F' | 'E' {
  const t = (name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  if (/\bmba\b|master of business/.test(t)) return 'E';
  if (/diplomado|extension/.test(t)) return '8';
  if (/curso|taller|seminario|bootcamp|capacitacion/.test(t)) return 'F';
  return 'Y';
}

/**
 * How the two trayectoria-escolar sections differ.
 *
 * Formación académica and formación complementaria are the same form under
 * `isTrayectoria=TE` and `=FC`: same fields, same pickers, a different level
 * catalogue, and a start month that only FC demands.
 */
interface TrayectoriaOptions {
  nivelOf: (edu: EducationItem) => string;
  /** FC marks "Mes de inicio" required; TE does not have it. */
  requiresStartMonth: boolean;
}

async function fillTrayectoriaEscolar(
  page: Page,
  edu: EducationItem,
  report: FillReport,
  opts: TrayectoriaOptions
): Promise<void> {
  const defaults = loadConfig().defaults ?? {};

  // An explicit code wins: CvLAC's own wording is the only thing that can
  // settle an ambiguous name, and the caller may have read it off the form.
  const nivelCode = edu.nivel ?? opts.nivelOf(edu);
  await tryField(report, 'cod_nivel_formacion', () =>
    page.selectOption('select[name="cod_nivel_formacion"]', nivelCode)
  );
  await humanDelay(200, 500);

  await setInstitucion(page, report, edu.institution);
  await humanDelay(200, 500);

  await setMunicipio(page, report, defaults.municipio?.nombre, defaults.municipio?.codigoDane);
  await humanDelay(200, 400);

  // CvLAC shows — and requires — the programme picker for every level above
  // secondary school, and validates the hidden code rather than the text.
  const nivel = nivelCode;
  if (needsProgramaAcademico(nivel)) {
    await setProgramaAcademico(page, report, nivel, edu.degree);
    await humanDelay(200, 400);
  }
  await setReadonlyField(page, report, 'txt_nme_titulo_obtenido', edu.degree);

  if (defaults.horasSemanales !== undefined) {
    await tryField(report, 'nro_horas_semanales', () =>
      page.fill('input:not([type="hidden"])[name="nro_horas_semanales"]', String(defaults.horasSemanales))
    );
  } else {
    missingValue(report, 'nro_horas_semanales', 'define defaults.horasSemanales en cvlac.config.json');
  }

  const { start, end } = parsePeriod(edu.period);
  if (start) {
    await tryField(report, 'nro_ano_inicio', () =>
      page.selectOption('select[name="nro_ano_inicio"]', start)
    );
  } else {
    missingValue(report, 'nro_ano_inicio', 'el período no contiene un año');
  }
  if (end) {
    await tryField(report, 'nro_ano_obten', () => page.selectOption('select[name="nro_ano_obten"]', end));
  }

  if (opts.requiresStartMonth) {
    const month = edu.startMonth ? String(parseInt(edu.startMonth, 10)) : undefined;
    if (month) {
      await tryField(report, 'nro_mes_inicio', () =>
        page.selectOption('select[name="nro_mes_inicio"]', month)
      );
    } else {
      // The form preselects Enero, so an item without a month is stored as
      // January rather than rejected. Saying so beats a silent wrong month.
      report.warnings.push(
        'nro_mes_inicio: el ítem no trae "startMonth"; CvLAC deja el mes que trae preseleccionado (Enero)'
      );
    }
  }
  await humanDelay(200, 400);
}

const fillFormacion = (page: Page, edu: EducationItem, report: FillReport): Promise<void> =>
  fillTrayectoriaEscolar(page, edu, report, {
    nivelOf: (e) => inferNivel(e.degree),
    requiresStartMonth: false,
  });

const fillFormacionComple = (page: Page, edu: EducationItem, report: FillReport): Promise<void> =>
  fillTrayectoriaEscolar(page, edu, report, {
    nivelOf: (e) => inferNivelComple(e.degree),
    requiresStartMonth: true,
  });

async function fillExperiencia(page: Page, exp: ExperienceItem, report: FillReport): Promise<void> {
  const defaults = loadConfig().defaults ?? {};

  await setInstitucion(page, report, exp.company);
  await humanDelay(200, 500);

  // "Dedicación (*)" is required and defaulted to 0 by the form; leaving it
  // alone stored every experience as zero hours a week.
  if (defaults.horasSemanales !== undefined) {
    await tryField(report, 'nro_hora_dedicacion', () =>
      page.fill('input:not([type="hidden"])[name="nro_hora_dedicacion"]', String(defaults.horasSemanales))
    );
  } else {
    missingValue(report, 'nro_hora_dedicacion', 'define defaults.horasSemanales en cvlac.config.json');
  }

  // CvLAC's experience form has no field for the role: institution, dates,
  // dedication, current-affiliation and free text, and nothing else.
  if (exp.role) {
    report.warnings.push(
      `rol "${exp.role}": el formulario de experiencia de CvLAC no tiene campo de cargo, así que no se escribió`
    );
  }

  const { start, end } = parsePeriod(exp.period);
  // Year fields may render as <select> or <input> depending on the form — try both.
  if (start) {
    const ok = await tryField(report, 'nro_ano_inicio (select)', () =>
      page.selectOption('select[name="nro_ano_inicio"]', start)
    );
    if (!ok) {
      report.warnings.pop();
      await tryField(report, 'nro_ano_inicio', () => page.fill('input:not([type="hidden"])[name="nro_ano_inicio"]', start));
    }
  }
  if (end) {
    const ok = await tryField(report, 'nro_ano_fin (select)', () =>
      page.selectOption('select[name="nro_ano_fin"]', end)
    );
    if (!ok) {
      report.warnings.pop();
      await tryField(report, 'nro_ano_fin', () => page.fill('input:not([type="hidden"])[name="nro_ano_fin"]', end));
    }
  }
  await humanDelay(200, 400);
}

async function fillCurso(page: Page, course: CourseItem, report: FillReport): Promise<void> {
  const defaults = loadConfig().defaults ?? {};

  await tryField(report, 'txt_nme_prod', () => page.fill('input:not([type="hidden"])[name="txt_nme_prod"]', course.name));
  await humanDelay(200, 500);

  // cod_tipo_producto is a radio; without it CvLAC rejects the form.
  await tryField(report, 'cod_tipo_producto', () =>
    course.tipoProducto
      ? page.click(`input[name="cod_tipo_producto"][value="${course.tipoProducto}"]`)
      : page.locator('input[name="cod_tipo_producto"]').first().check()
  );
  await humanDelay(200, 300);

  const year = course.date?.slice(0, 4) ?? '';
  const month = (course.date ?? '').length >= 7 ? course.date.slice(5, 7) : '';
  if (year) {
    await tryField(report, 'nro_ano_presenta', () =>
      page.selectOption('select[name="nro_ano_presenta"]', year)
    );
  } else {
    missingValue(report, 'nro_ano_presenta', 'la fecha del curso no trae año');
  }
  if (month) {
    await tryField(report, 'nro_mes_presenta', () =>
      page.selectOption('select[name="nro_mes_presenta"]', String(parseInt(month, 10)))
    );
  }

  if (course.participacion) {
    await tryField(report, 'txt_participacion', () =>
      page.selectOption('select[name="txt_participacion"]', course.participacion!)
    );
  }
  if (course.duracionHoras !== undefined) {
    await tryField(report, 'nro_duracion', () =>
      page.fill('input:not([type="hidden"])[name="nro_duracion"]', String(course.duracionHoras))
    );
  }
  if (course.lugar) {
    await tryField(report, 'txt_lugar', () => page.fill('input:not([type="hidden"])[name="txt_lugar"]', course.lugar!));
  }

  const idioma = course.idioma ?? defaults.idioma;
  if (idioma) {
    await tryField(report, 'sgl_idioma', () => page.selectOption('select[name="sgl_idioma"]', idioma));
  } else {
    missingValue(report, 'sgl_idioma', 'define defaults.idioma en cvlac.config.json');
  }

  const pais = course.pais ?? defaults.pais;
  if (pais) {
    await tryField(report, 'sgl_pais', () =>
      page.selectOption('select[name="sgl_pais"]', countryOption(pais)!)
    );
  } else {
    missingValue(report, 'sgl_pais', 'define defaults.pais en cvlac.config.json');
  }

  await setMunicipio(
    page,
    report,
    course.ciudad ?? defaults.municipio?.nombre,
    course.codMunicipio ?? defaults.municipio?.codigoDane
  );
  await humanDelay(200, 400);
}

async function fillReconocimiento(page: Page, ach: AchievementItem, report: FillReport): Promise<void> {
  await tryField(report, 'txt_nme_reconocimiento', () =>
    page.fill('input:not([type="hidden"])[name="txt_nme_reconocimiento"]', ach.title)
  );
  await humanDelay(200, 400);

  // The award year is data, not something to default: a wrong year is worse than a rejected form.
  if (ach.year) {
    await tryField(report, 'nro_ano_obtencion', () =>
      page.selectOption('select[name="nro_ano_obtencion"]', ach.year!)
    );
  } else {
    missingValue(report, 'nro_ano_obtencion', 'el ítem no trae "year"');
  }
  if (ach.month) {
    await tryField(report, 'nro_mes_obtencion', () =>
      page.selectOption('select[name="nro_mes_obtencion"]', String(parseInt(ach.month!, 10)))
    );
  }
  if (ach.ambito) {
    await tryField(report, 'tpo_ambito', () =>
      page.selectOption('select[name="tpo_ambito"]', ach.ambito!)
    );
  }
  await humanDelay(200, 300);
}

async function fillProyecto(page: Page, proj: ProjectItem, report: FillReport): Promise<void> {
  const defaults = loadConfig().defaults ?? {};

  await tryField(report, 'tpo_proyecto', () =>
    page.click(`input[name="tpo_proyecto"][value="${proj.tipoProyecto}"]`)
  );
  await humanDelay(200, 400);

  await tryField(report, 'txt_nme_proyecto', () =>
    page.fill('input:not([type="hidden"])[name="txt_nme_proyecto"]', proj.title)
  );
  await humanDelay(200, 400);

  await tryField(report, 'nro_ano_inicio', () =>
    page.selectOption('select[name="nro_ano_inicio"]', proj.startYear)
  );
  await tryField(report, 'nro_mes_inicio', () =>
    page.selectOption('select[name="nro_mes_inicio"]', proj.startMonth)
  );
  if (proj.endYear) {
    await tryField(report, 'nro_ano_fin', () =>
      page.selectOption('select[name="nro_ano_fin"]', proj.endYear!)
    );
  }
  if (proj.endMonth) {
    await tryField(report, 'nro_mes_fin', () =>
      page.selectOption('select[name="nro_mes_fin"]', proj.endMonth!)
    );
  }
  await humanDelay(200, 400);

  await tryField(report, 'tpo_participacion_proy', () =>
    page.selectOption('select[name="tpo_participacion_proy"]', inferParticipacionProy(proj.participacion))
  );
  await humanDelay(200, 400);

  const instName = proj.institution ?? defaults.institucionFallback;
  if (instName) {
    await setInstitucionFields(page, report, instName, 'id_inst', 'nme_inst');
  } else {
    missingValue(
      report,
      'institución del proyecto',
      'añade "institution" al ítem o defaults.institucionFallback en cvlac.config.json'
    );
  }
  await humanDelay(200, 400);

  const tipoFin = proj.tipoFinanciacion ?? 'SO';
  await tryField(report, 'tpo_financiacion', () =>
    page.click(`input[name="tpo_financiacion"][value="${tipoFin}"]`)
  );
  await humanDelay(200, 300);
  if (tipoFin === 'FI') {
    await tryField(report, 'tpo_fuente_finan', () =>
      page.click(`input[name="tpo_fuente_finan"][value="${proj.fuenteFinanciacion ?? 'I'}"]`)
    );
    // tpo_rol select: F=Financiadora, E=Ejecutora, C=Coejecutora
    const rol = proj.tipoParticipacionInstitucion === 'FI' ? 'F' : 'E';
    await tryField(report, 'tpo_rol', () => page.selectOption('select[name="tpo_rol"]', rol));
    await humanDelay(200, 300);
  }

  // The administrative act and its date stay on screen — and required — whatever
  // the financing is; only the amount hides on a non-financed project.
  await tryField(report, 'txt_acto_adm', () =>
    page.fill('input:not([type="hidden"])[name="txt_acto_adm"]', proj.nroActoAdministrativo ?? 'N/A', {
      timeout: FIELD_TIMEOUT_MS,
    })
  );
  if (!proj.nroActoAdministrativo) {
    report.warnings.push(
      'txt_acto_adm: CvLAC lo exige y el proyecto no lo trae; se envió "N/A". Añade "nroActoAdministrativo" para que quede el real'
    );
  }

  // Derived from the project's own start date when it is not given: CvLAC will
  // not accept the form without one, and a date taken from the project beats a
  // date made up out of nothing.
  const fechaActo =
    cvlacDateString(proj.fechaActoAdministrativo) ??
    cvlacDateString(`01/${proj.startMonth ?? '01'}/${proj.startYear}`);
  if (fechaActo) {
    await setReadonlyField(page, report, 'dta_acto_admString', fechaActo);
    if (!proj.fechaActoAdministrativo) {
      report.warnings.push(
        `dta_acto_admString: se derivó ${fechaActo} de la fecha de inicio del proyecto; añade "fechaActoAdministrativo" si es otra`
      );
    }
  } else {
    missingValue(report, 'dta_acto_admString', 'añade "fechaActoAdministrativo" con formato yyyy-mm-dd');
  }

  if (projectValueApplies(tipoFin)) {
    if (proj.valorSinContrapartida) {
      await tryField(report, 'nro_valor', () =>
        page.fill('input:not([type="hidden"])[name="nro_valor"]', proj.valorSinContrapartida!, { timeout: FIELD_TIMEOUT_MS })
      );
      if (Number(proj.valorSinContrapartida) < 10000000) {
        report.warnings.push(
          `nro_valor: CvLAC exige un valor mínimo de 10.000.000 y el proyecto trae ${proj.valorSinContrapartida}`
        );
      }
    } else {
      missingValue(report, 'nro_valor', 'añade "valorSinContrapartida" al proyecto financiado');
    }
  }
  await humanDelay(200, 400);

  await tryField(report, 'txt_resumen_proyecto', () =>
    page.fill('textarea[name="txt_resumen_proyecto"]', proj.description)
  );
  await humanDelay(200, 400);
}

async function fillSoftware(page: Page, sw: SoftwareItem, report: FillReport): Promise<void> {
  await tryField(report, 'cod_tipo_producto', () =>
    page.click(`input[name="cod_tipo_producto"][value="${sw.tipoSoftware ?? '211'}"]`)
  );
  await humanDelay(200, 400);

  await tryField(report, 'txt_nme_prod', () => page.fill('input:not([type="hidden"])[name="txt_nme_prod"]', sw.name));
  await humanDelay(200, 400);

  await tryField(report, 'nro_ano_presenta', () =>
    page.selectOption('select[name="nro_ano_presenta"]', sw.year)
  );
  if (sw.month) {
    await tryField(report, 'nro_mes_presenta', () =>
      page.selectOption('select[name="nro_mes_presenta"]', sw.month!)
    );
  }
  await humanDelay(200, 400);

  if (sw.url) {
    await tryField(report, 'txt_web_producto', () =>
      page.fill('input:not([type="hidden"])[name="txt_web_producto"]', sw.url!)
    );
    await humanDelay(200, 300);
  }

  // Sin registro/patente/secreto: "Ninguno" to skip mandatory registry fields
  await tryField(report, 'tpo_prod_tiene', () =>
    page.click('input[name="tpo_prod_tiene"][value="N"]')
  );
  await humanDelay(400, 600);

  // CvLAC requires all six technical textareas.
  const tech = sw.descripcionTecnica ?? {};
  const generic = sw.description ?? sw.name;
  if (!sw.descripcionTecnica && !sw.description) {
    report.warnings.push(
      'descripción técnica: se repitió el nombre en las 6 áreas; añade "descripcionTecnica" o "description" al ítem'
    );
  }
  const textareas: Array<[string, string | undefined]> = [
    ['txt_analisis', tech.analisis],
    ['txt_desarrollo', tech.desarrollo],
    ['txt_implementacion', tech.implementacion],
    ['txt_validacion', tech.validacion],
    ['txt_plataforma', tech.plataforma],
    ['txt_ambiente', tech.ambiente],
  ];
  for (const [name, value] of textareas) {
    await tryField(report, name, () => page.fill(`textarea[name="${name}"]`, value ?? generic));
    await humanDelay(80, 160);
  }
  await humanDelay(200, 400);
}

async function fillEvento(page: Page, ev: EventoCientificoItem, report: FillReport): Promise<void> {
  const defaults = loadConfig().defaults ?? {};

  await page.waitForLoadState('networkidle').catch(() => {});
  await humanDelay(400, 800);

  await tryField(report, 'txt_nme_evento', () => page.fill('input:not([type="hidden"])[name="txt_nme_evento"]', ev.name));
  await humanDelay(200, 400);

  if (ev.tipoEvento) {
    await tryField(report, 'tpo_evento', () =>
      page.selectOption('select[name="tpo_evento"]', ev.tipoEvento!)
    );
  }
  if (ev.ambito) {
    await tryField(report, 'tpo_clasificacion', () =>
      page.selectOption('select[name="tpo_clasificacion"]', ev.ambito!)
    );
  }
  await humanDelay(200, 400);

  // Dates are readonly → inject via JS
  // CvLAC stores these as yyyy-mm-dd; writing a day-first date leaves the form
  // holding one shape and the record another.
  const startDate = cvlacDateString(ev.startDate);
  if (startDate) {
    await setReadonlyField(page, report, 'dta_inicioString', startDate);
  } else {
    missingValue(report, 'dta_inicioString', `no se pudo leer "${ev.startDate}" como fecha`);
  }
  if (ev.endDate) {
    const endDate = cvlacDateString(ev.endDate);
    if (endDate) {
      await setReadonlyField(page, report, 'dta_finString', endDate);
    } else {
      missingValue(report, 'dta_finString', `no se pudo leer "${ev.endDate}" como fecha`);
    }
  }
  await humanDelay(200, 400);

  await setMunicipio(
    page,
    report,
    ev.ciudad ?? defaults.municipio?.nombre,
    ev.codMunicipio ?? defaults.municipio?.codigoDane
  );
  await humanDelay(200, 400);

  if (ev.lugar) {
    await tryField(report, 'txt_lugar', () => page.fill('input:not([type="hidden"])[name="txt_lugar"]', ev.lugar!));
    await humanDelay(200, 300);
  }

  // Rol (checkbox) — default Ponente
  const rolMap: Record<string, string> = {
    PO: 'input[name="tpo_part_ponente"]',
    PM: 'input[name="tpo_part_ponenteMag"]',
    OR: 'input[name="tpo_part_organizador"]',
    AS: 'input[name="tpo_part_asistente"]',
  };
  const rolSel = rolMap[ev.rol ?? 'PO'];
  if (rolSel) await tryField(report, `rol ${ev.rol ?? 'PO'}`, () => page.check(rolSel));
  await humanDelay(200, 400);

  if (ev.institution) {
    await setInstitucion(page, report, ev.institution);
    await humanDelay(200, 400);
  }

  if (ev.resumen) {
    await tryField(report, 'txt_resumen_evento', () =>
      page.fill('textarea[name="txt_resumen_evento"]', ev.resumen!)
    );
    await humanDelay(200, 400);
  }
}

// ── Section registry ─────────────────────────────────────────────────────────

interface SectionConfig {
  /** List page (all.do) used to find existing rows for update/delete. */
  listUrl: string;
  /** Create form (create.do). */
  createUrl: string;
  /** Index of the <td> in a list row that holds the matchable label. */
  matchCellIndex: number;
  /** Extract the matchable label from the item data. */
  labelOf: (data: any) => string;
  /** Fill the create/edit form with the item data (no navigation, no submit). */
  fill: (page: Page, data: any, report: FillReport) => Promise<void>;
}


/**
 * A language and the four skills CvLAC grades separately.
 *
 * Its select holds every language in Spanish, so the name is matched against
 * the options themselves rather than against a table this server would have to
 * keep in step; a two-letter code is taken as given.
 */
export async function fillIdioma(page: Page, item: LanguageInput, report: FillReport): Promise<void> {
  // The create form picks the language from a select. The edit form has none:
  // the language is the record's key, so it travels in a hidden field and
  // cannot change. Looking for options there found nothing and the filler used
  // to give up, leaving every level untouched.
  if (await page.$('select[name="sgl_idioma"]')) {
    await selectIdioma(page, item, report);
    if (!report.warnings.some((w) => w.startsWith('sgl_idioma'))) await humanDelay(200, 400);
  }

  const skills: Array<[keyof LanguageInput, string]> = [
    ['read', 'tpo_nivel_leer'],
    ['write', 'tpo_nivel_escribir'],
    ['speak', 'tpo_nivel_hablar'],
    ['listen', 'tpo_nivel_escuchar'],
  ];
  for (const [key, field] of skills) {
    const text = (item[key] as string | undefined) ?? item.level;
    if (!text) {
      missingValue(report, field, 'el ítem no trae nivel para esta destreza ni un "level" general');
      continue;
    }
    const level = languageLevel(text);
    if (!level) {
      missingValue(report, field, `"${text}" no es Deficiente, Aceptable ni Bueno`);
      continue;
    }
    await tryField(report, field, () => page.check(`input[name="${field}"][value="${level}"]`));
  }
  await humanDelay(200, 300);
}

/** Picks the language on the create form, where the name has to be resolved. */
async function selectIdioma(page: Page, item: LanguageInput, report: FillReport): Promise<void> {
  const wanted = (item.language ?? '').trim();
  const code = /^[A-Za-z]{2}$/.test(wanted)
    ? wanted.toUpperCase()
    : await page.$$eval(
        'select[name="sgl_idioma"] option',
        (options, name: string) => {
          const norm = (s: string): string =>
            s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          const target = norm(name);
          const hit = options.find((o) => norm(o.textContent ?? '') === target);
          return hit ? (hit as HTMLOptionElement).value : '';
        },
        wanted
      );

  if (!code) {
    missingValue(report, 'sgl_idioma', `CvLAC no lista un idioma llamado "${wanted}"`);
    return;
  }
  await tryField(report, 'sgl_idioma', () => page.selectOption('select[name="sgl_idioma"]', code));
}

async function fillLinea(page: Page, item: ResearchLineInput, report: FillReport): Promise<void> {
  await tryField(report, 'txt_nme_linea', () =>
    page.fill('input:not([type="hidden"])[name="txt_nme_linea"]', item.name)
  );
  await humanDelay(200, 400);

  // CvLAC preselects neither radio, so leaving it alone gets the form rejected.
  // An active line is the ordinary case; the assumption is reported, not hidden.
  const active = item.active ?? true;
  if (item.active === undefined) {
    report.warnings.push('sta_activa: el ítem no dice si la línea está activa; se marcó "Sí"');
  }
  await tryField(report, 'sta_activa', () =>
    page.check(`input[name="sta_activa"][value="${active ? 'T' : 'F'}"]`)
  );

  if (item.objective) {
    await tryField(report, 'txt_objeto', () =>
      page.fill('textarea[name="txt_objeto"]', item.objective!)
    );
  } else {
    missingValue(report, 'txt_objeto', 'el ítem no trae "objective"');
  }
  await humanDelay(200, 300);
}

const SECTIONS: Record<CvLACSectionName, SectionConfig> = {
  idiomas: {
    ...SECTION_LIST.idiomas,
    createUrl: URLS.idiomasCreate,
    labelOf: (d: LanguageInput) => d.language,
    fill: fillIdioma,
  },
  lineas: {
    ...SECTION_LIST.lineas,
    createUrl: URLS.lineasCreate,
    labelOf: (d: ResearchLineInput) => d.name,
    fill: fillLinea,
  },
  formacionComple: {
    ...SECTION_LIST.formacionComple,
    createUrl: URLS.formacionCompleCreate,
    labelOf: (d: EducationItem) => d.degree,
    fill: fillFormacionComple,
  },
  formacion: {
    ...SECTION_LIST.formacion,
    createUrl: URLS.formacionCreate,
    labelOf: (d: EducationItem) => d.degree,
    fill: fillFormacion,
  },
  experiencia: {
    ...SECTION_LIST.experiencia,
    createUrl: URLS.experienciaCreate,
    labelOf: (d: ExperienceItem) => d.company,
    fill: fillExperiencia,
  },
  cursos: {
    ...SECTION_LIST.cursos,
    createUrl: URLS.cursosCreate,
    labelOf: (d: CourseItem) => d.name,
    fill: fillCurso,
  },
  reconocimientos: {
    ...SECTION_LIST.reconocimientos,
    createUrl: URLS.reconocimientosCreate,
    labelOf: (d: AchievementItem) => d.title,
    fill: fillReconocimiento,
  },
  proyectos: {
    ...SECTION_LIST.proyectos,
    createUrl: URLS.proyectosCreate,
    labelOf: (d: ProjectItem) => d.title,
    fill: fillProyecto,
  },
  software: {
    ...SECTION_LIST.software,
    createUrl: URLS.softwareCreate,
    labelOf: (d: SoftwareItem) => d.name,
    fill: fillSoftware,
  },
  eventos: {
    ...SECTION_LIST.eventos,
    createUrl: URLS.eventosCreate,
    labelOf: (d: EventoCientificoItem) => d.name,
    fill: fillEvento,
  },
};

/**
 * Find the href of an action link (Detalles/Editar/Eliminar) for the list row whose
 * cell `matchCellIndex` matches `label` (accent/case/punctuation-insensitive).
 */
export async function findRowActionHref(
  page: Page,
  matchCellIndex: number,
  label: string,
  linkText: string
): Promise<string | null> {
  return page.evaluate(
    ({ idx, target, link }) => {
      const norm = (s: string | null | undefined): string =>
        (s ?? '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      const t = norm(target);
      const linkN = norm(link);
      const rows = Array.from(document.querySelectorAll('tr.odd, tr.even'));
      for (const r of rows) {
        const cells = r.querySelectorAll('td');
        const cellText = norm(cells[idx] ? cells[idx].textContent : '');
        if (cellText && (cellText === t || cellText.includes(t) || t.includes(cellText))) {
          const a = Array.from(r.querySelectorAll('a')).find((el) => norm(el.textContent).includes(linkN));
          if (a) return a.getAttribute('href');
        }
      }
      return null;
    },
    { idx: matchCellIndex, target: label, link: linkText }
  );
}

/**
 * Copies what a filler set into the hidden twins that share the field's name.
 *
 * CvLAC's edit pages carry a hidden copy of several fields — txt_nme_prod,
 * nro_ano_presenta and friends — holding the stored value, ahead of the control
 * a person edits. Both go out in the POST and Struts keeps the first, so an edit
 * that looked applied on screen was discarded on arrival: the course year never
 * moved off its original value.
 */
async function syncHiddenDuplicates(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const synced: string[] = [];
    const named = Array.from(
      document.querySelectorAll('input[name], select[name], textarea[name]')
    ) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

    const byName = new Map<string, typeof named>();
    for (const el of named) {
      const name = el.getAttribute('name');
      if (!name) continue;
      const list = byName.get(name) ?? [];
      list.push(el);
      byName.set(name, list);
    }

    const isHidden = (el: Element): boolean =>
      el instanceof HTMLInputElement && el.type.toLowerCase() === 'hidden';

    for (const [name, group] of byName) {
      if (group.length < 2) continue;
      const editable = group.find((el) => !isHidden(el));
      if (!editable) continue;

      const value =
        editable instanceof HTMLInputElement &&
        (editable.type === 'radio' || editable.type === 'checkbox')
          ? (group.find((el) => el instanceof HTMLInputElement && el.checked) as HTMLInputElement | undefined)
              ?.value
          : editable.value;
      if (value === undefined) continue;

      for (const el of group) {
        if (el === editable || !isHidden(el)) continue;
        if (el.value !== value) {
          (el as HTMLInputElement).value = value;
          synced.push(name);
        }
      }
    }
    return synced;
  });
}

/**
 * Whether what came back is MinCiencias' outage page rather than CvLAC.
 *
 * It is served for any URL and carries no CvLAC markup, so a submit that lands
 * on it has left the form without having been saved — which read as success.
 */
/** Whether what came back is CvLAC's own stack trace rather than a form. */
async function landedOnServerError(page: Page): Promise<boolean> {
  const html = await page.content().catch(() => '');
  return isServerErrorMarkup(html);
}

export async function landedOnOutage(page: Page): Promise<boolean> {
  const html = await page.content().catch(() => '');
  return isOutageMarkup(html);
}

/** A submit landed back on a form page (instead of the list) ⇒ validation rejected it. */
function landedOnForm(page: Page): boolean {
  return /create\.do|insert\.do|edit\.do|update\.do/.test(page.url());
}

async function shot(page: Page): Promise<string> {
  return session.takeScreenshot(page);
}

function ok(message: string, report: FillReport, screenshotBase64?: string): UpdateResult {
  return {
    success: true,
    status: 'ok',
    message,
    warnings: report.warnings.length ? report.warnings : undefined,
    screenshotBase64,
  };
}

function failed(message: string, report: FillReport, screenshotBase64?: string): UpdateResult {
  return {
    success: false,
    status: 'failed',
    message,
    warnings: report.warnings.length ? report.warnings : undefined,
    screenshotBase64,
  };
}

/** Combines the server's own complaints with the fields we could not fill. */
async function describeRejection(page: Page, action: string, label: string): Promise<string> {
  const serverErrors = await readFormErrors(page);
  const base = `Form validation failed ${action} "${label}"`;
  return serverErrors.length ? `${base}: ${serverErrors.join(' | ')}` : base;
}

/**
 * Existing CvLAC rows close enough to `label` that adding would risk a duplicate.
 * Assumes the page is already on the section's list.
 */
async function findSimilarRows(
  page: Page,
  cfg: SectionConfig,
  label: string
): Promise<SimilarCandidate[]> {
  const rows = await listRowLabels(page, cfg.matchCellIndex);
  const out: SimilarCandidate[] = [];
  for (const row of rows) {
    const match = classifyMatch(label, row);
    if (match !== 'none') out.push({ label: row, matchType: match });
  }
  return out;
}

async function addItem(
  pageRef: { page: Page },
  cfg: SectionConfig,
  data: unknown,
  label: string,
  confirmDuplicate: boolean
): Promise<UpdateResult> {
  const report: FillReport = { warnings: [] };

  // Duplicate guard: CvLAC has no unique constraints and removing a duplicate by
  // hand is tedious, so an ambiguous add stops here and asks.
  if (!confirmDuplicate) {
    await gotoFormWithRelogin(pageRef, cfg.listUrl);
    const similar = await findSimilarRows(pageRef.page, cfg, label);
    if (similar.length > 0) {
      log.info('add blocked by existing similar items', { label, count: similar.length });
      return {
        success: false,
        status: 'needs_confirmation',
        message:
          `CvLAC ya tiene ${similar.length} ítem(s) igual(es) o parecido(s) a "${label}". ` +
          'Usa action:"update" para modificar el existente, o repite el add con confirmDuplicate:true para crearlo igualmente.',
        similar,
      };
    }
  }

  await gotoFormWithRelogin(pageRef, cfg.createUrl);
  await humanDelay();
  await cfg.fill(pageRef.page, data, report);
  if (report.blockers?.length) {
    return blockedRefusal(label, report.blockers, report.warnings);
  }
  await syncHiddenDuplicates(pageRef.page);
  await humanDelay(400, 800);
  await clickGuardar(pageRef.page);
  const screenshotBase64 = await shot(pageRef.page);
  if (await landedOnServerError(pageRef.page)) {
    return failed(
      `CvLAC respondió con un error interno (HTTP 500) al guardar "${label}". No es el formulario: ` +
        `su propio validador lanzó una excepción. Revisa el screenshot y reintenta más tarde.`,
      report,
      screenshotBase64
    );
  }
  if (landedOnForm(pageRef.page)) {
    return failed(await describeRejection(pageRef.page, 'adding', label), report, screenshotBase64);
  }

  // An outage page is not the redirect that follows a save. The list is the only
  // thing that can say whether the row exists, so ask it.
  if (await landedOnOutage(pageRef.page)) {
    log.warn('add landed on the outage page; checking the list', { label });
    await gotoFormWithRelogin(pageRef, cfg.listUrl);
    const created = await findRowActionHref(pageRef.page, cfg.matchCellIndex, label, 'Eliminar');
    if (!created) {
      return failed(
        `CvLAC respondió con su página de "Server Unavailable" al guardar "${label}", y la fila no aparece en la lista: no se creó.`,
        report,
        screenshotBase64
      );
    }
    report.warnings.push(
      'CvLAC respondió con su página de "Server Unavailable" al guardar, pero la fila sí aparece en la lista'
    );
  }

  log.info('item added', { label, warnings: report.warnings.length });
  return ok(`Added: ${label}`, report, screenshotBase64);
}

async function updateItem(
  pageRef: { page: Page },
  cfg: SectionConfig,
  data: unknown,
  label: string
): Promise<UpdateResult> {
  const report: FillReport = { warnings: [] };
  await gotoFormWithRelogin(pageRef, cfg.listUrl);
  const editHref = await findRowActionHref(pageRef.page, cfg.matchCellIndex, label, 'Editar');
  if (!editHref) {
    return failed(`No existing item matching "${label}" to update`, report);
  }
  await gotoFormWithRelogin(pageRef, BASE_URL + editHref);
  await humanDelay();
  const beforeFill = await readFormValues(pageRef.page);
  await cfg.fill(pageRef.page, data, report);
  // Captions the picker fills are left out: CvLAC re-renders them its own way,
  // and the hidden codes beside them are what it actually stores.
  const synced = await syncHiddenDuplicates(pageRef.page);
  if (synced.length > 0) {
    log.debug('hidden duplicates aligned with the visible controls', { fields: synced });
  }
  if (report.blockers?.length) {
    return blockedRefusal(label, report.blockers, report.warnings);
  }
  const edits = verifiableFields(changedFields(beforeFill, await readFormValues(pageRef.page)));
  // Submitting an untouched form is indistinguishable from a successful save,
  // so it does not get submitted.
  if (Object.keys(edits).length === 0) {
    return noChangeRefusal(label, report.warnings);
  }
  await humanDelay(400, 800);
  await clickGuardar(pageRef.page);
  const screenshotBase64 = await shot(pageRef.page);

  if (await landedOnServerError(pageRef.page)) {
    return failed(
      `CvLAC respondió con un error interno (HTTP 500) al actualizar "${label}"; su propio validador ` +
        `lanzó una excepción. Verifica con read_cvlac_detail antes de reintentar.`,
      report,
      screenshotBase64
    );
  }
  const outage = await landedOnOutage(pageRef.page);
  const outcome = classifySubmit({
    landedOnForm: landedOnForm(pageRef.page),
    errors: await readFormErrors(pageRef.page),
    outage,
  });
  if (outage) {
    report.warnings.push(
      'CvLAC respondió con su página de "Server Unavailable" al guardar; el veredicto sale de releer el formulario'
    );
  }

  if (outcome === 'rejected') {
    return failed(await describeRejection(pageRef.page, 'updating', label), report, screenshotBase64);
  }

  // CvLAC sometimes re-renders the edit form after saving, with nothing to say.
  // Reloading it shows what was stored, which is the only honest answer here.
  if (outcome === 'unverified') {
    if (Object.keys(edits).length === 0) {
      report.warnings.push('the form was submitted unchanged, so there was nothing to verify');
      return ok(`Updated: ${label}`, report, screenshotBase64);
    }
    log.info('submit returned without confirming; verifying', { label });
    const stored = await gotoFormWithRelogin(pageRef, BASE_URL + editHref)
      .then(() => readFormValues(pageRef.page))
      .catch(() => ({}) as Record<string, string>);

    const verdict = verificationVerdict(stored, edits);
    if (verdict === 'contradicted') {
      const disagreed = disagreeingFields(stored, edits);
      return failed(
        `CvLAC returned the form again for "${label}" and kept its previous values in: ` +
          `${disagreed.join(', ')}. The change was not stored.`,
        report,
        screenshotBase64
      );
    }
    if (verdict === 'unreadable') {
      // Sent, and unread. Saying "failed" here reported two writes CvLAC had
      // kept; saying "ok" would invent a confirmation nobody has.
      return {
        success: false,
        status: 'unverified',
        message:
          `Se envió la edición de "${label}" pero no se pudo releer el formulario para confirmarla ` +
          '(CvLAC no respondió con sus campos). Puede haberse guardado o no: verifícalo con read_cvlac_detail antes de reintentar.',
        warnings: report.warnings.length ? report.warnings : undefined,
        screenshotBase64,
      };
    }
    report.warnings.push(
      'CvLAC no respondió con la lista, pero los valores almacenados coinciden con lo enviado'
    );
  }

  log.info('item updated', { label, warnings: report.warnings.length });
  return ok(`Updated: ${label}`, report, screenshotBase64);
}

async function deleteItem(pageRef: { page: Page }, cfg: SectionConfig, label: string): Promise<UpdateResult> {
  const report: FillReport = { warnings: [] };
  await gotoFormWithRelogin(pageRef, cfg.listUrl);
  const confirmHref = await findRowActionHref(pageRef.page, cfg.matchCellIndex, label, 'Eliminar');
  if (!confirmHref) {
    // The row may be there and simply locked: CvLAC drops the Eliminar link on
    // records it will not let go of, and "not found" would be a lie.
    const exists = await findRowActionHref(pageRef.page, cfg.matchCellIndex, label, 'Detalles');
    return exists ? undeletableRefusal(label) : failed(`No item matching "${label}" to delete`, report);
  }
  await gotoFormWithRelogin(pageRef, BASE_URL + confirmHref);
  const deleteHref = await pageRef.page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('a')).find(
      (el) => /borrar|eliminar/i.test(el.textContent ?? '') || /delete\.do/i.test(el.getAttribute('href') ?? '')
    );
    return a ? a.getAttribute('href') : null;
  });
  if (!deleteHref) {
    const screenshotBase64 = await shot(pageRef.page);
    return failed(`Confirm page had no Borrar/delete link for "${label}"`, report, screenshotBase64);
  }
  // Three of CvLAC's delete endpoints answer 5xx and delete the row anyway, so
  // the status here decides nothing: the list does.
  const deleteStatus = await gotoFormWithRelogin(pageRef, BASE_URL + deleteHref, {
    tolerateUnavailable: true,
  });
  await gotoFormWithRelogin(pageRef, cfg.listUrl);
  const still = await findRowActionHref(pageRef.page, cfg.matchCellIndex, label, 'Eliminar');
  const screenshotBase64 = await shot(pageRef.page);
  if (still) {
    const why =
      deleteStatus !== null && deleteStatus >= 500
        ? `Delete failed: CvLAC answered HTTP ${deleteStatus} and "${label}" is still listed`
        : `Delete may have failed; "${label}" still present`;
    return failed(why, report, screenshotBase64);
  }
  if (deleteStatus !== null && deleteStatus >= 500) {
    report.warnings.push(
      `CvLAC answered HTTP ${deleteStatus} to the delete link, but the row is gone from the list`
    );
  }
  log.info('item deleted', { label });
  return ok(`Deleted: ${label}`, report, screenshotBase64);
}

export async function updateSectionTool(req: UpdateRequest): Promise<UpdateResult> {
  await session.login();
  const pageRef = { page: await session.getPage() };

  const cfg = SECTIONS[req.section];
  if (!cfg) {
    await pageRef.page.close();
    return { success: false, status: 'failed', message: `Section "${req.section}" not supported` };
  }

  try {
    const label = cfg.labelOf(req.data);
    log.info('update_section', { section: req.section, action: req.action, label });
    if (req.action === 'delete' && req.confirmDelete !== true) {
      return deleteConfirmation(`${req.section} › "${label}"`);
    }
    switch (req.action) {
      case 'add':
        return await addItem(pageRef, cfg, req.data, label, req.confirmDuplicate === true);
      case 'update':
        return await updateItem(pageRef, cfg, req.data, label);
      case 'delete':
        return await deleteItem(pageRef, cfg, label);
      default: {
        const _exhaustive: never = req.action;
        return { success: false, status: 'failed', message: `Action "${String(_exhaustive)}" not supported` };
      }
    }
  } catch (err) {
    const screenshotBase64 = await shot(pageRef.page).catch(() => undefined);
    const msg = err instanceof Error ? err.message : String(err);
    log.error('update_section failed', { section: req.section, action: req.action, error: msg });
    return { success: false, status: 'failed', message: msg, screenshotBase64 };
  } finally {
    await pageRef.page.close();
  }
}
