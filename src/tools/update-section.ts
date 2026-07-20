import type { Page } from 'playwright';
import { session } from '../browser/session.js';
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
} from '../types.js';
import { BASE_URL, URLS } from '../browser/navigation.js';
import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { classifyMatch } from '../diff.js';

const log = createLogger('update-section');

/**
 * Fields that could not be filled during one form submission.
 *
 * CvLAC rejects a form without saying which control was at fault, so every
 * skipped field is recorded here and returned to the caller alongside whatever
 * the server itself complained about.
 */
interface FillReport {
  warnings: string[];
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
    const url = `${BASE_URL}/cvlac/json/EnInstitucion/buscar.do?txt_nombre=${encodeURIComponent(term)}`;

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
  if (!nombre || !codigoDane) {
    missingValue(report, 'municipio', 'define defaults.municipio en cvlac.config.json');
    return;
  }
  const applied = await page.evaluate(
    ({ text, code }) => {
      const textEl = document.querySelector('input[name="cod_municipio_text"]') as HTMLInputElement | null;
      if (!textEl) return false;
      textEl.removeAttribute('readonly');
      textEl.value = text;
      const suffix = textEl.id.replace('_loc_', '');
      const hiddenEl = document.getElementById('_locValue_' + suffix) as HTMLInputElement | null;
      if (hiddenEl) hiddenEl.value = code;
      const all = Array.from(document.querySelectorAll('input[name="cod_municipio"]')) as HTMLInputElement[];
      for (const el of all) el.value = code;
      return true;
    },
    { text: nombre, code: codigoDane }
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

/** Returns true if the current page is a CvLAC login/redirect page */
async function isLoginPage(page: Page): Promise<boolean> {
  const url = page.url();
  return url.includes('Login') || url.includes('logOut') || url.includes('pre_s_login');
}

/** Navigate to a URL; throws SessionExpiredError if redirected to login (caller must reopen page) */
class SessionExpiredError extends Error {}

async function gotoForm(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (await isLoginPage(page)) {
    throw new SessionExpiredError('Session expired');
  }
}

/** Navigate with automatic re-login: closes old page, re-logins, opens new page, retries once */
async function gotoFormWithRelogin(pageRef: { page: Page }, url: string): Promise<void> {
  try {
    await gotoForm(pageRef.page, url);
  } catch (err) {
    if (!(err instanceof SessionExpiredError)) throw err;
    log.info('session expired mid-run; re-logging in', { url });
    await pageRef.page.close();
    await session.login(true);
    pageRef.page = await session.getPage();
    await pageRef.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (await isLoginPage(pageRef.page)) {
      throw new Error('Session expired and re-login failed');
    }
  }
}

/** Click the form's save button and wait for the navigation it triggers */
async function clickGuardar(page: Page): Promise<void> {
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
async function readFormErrors(page: Page): Promise<string[]> {
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
      '[style*="color:#f" i]',
    ];
    const seen = new Set<string>();
    for (const sel of selectors) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        // Long blocks are usually the whole page, not a message.
        if (text.length > 3 && text.length < 300) seen.add(text);
      }
    }
    return Array.from(seen).slice(0, 10);
  });
}

/** Reads the matchable label of every row in a list page. */
async function listRowLabels(page: Page, matchCellIndex: number): Promise<string[]> {
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

function inferNivel(degree: string): string {
  const d = degree.toLowerCase();
  if (d.includes('maestría') || d.includes('maestria') || d.includes('master') || d.includes('magister'))
    return '3';
  if (d.includes('doctorado') || d.includes('phd')) return '4';
  if (d.includes('especialización') || d.includes('especializacion') || d.includes('especialidad'))
    return '2';
  if (d.includes('técnico') || d.includes('tecnico')) return '9';
  return '1'; // Pregrado/Universitario
}

function parsePeriod(period: string): { start: string; end: string } {
  const years = period.match(/\d{4}/g) ?? [];
  return { start: years[0] ?? '', end: years[1] ?? '' };
}

/** Map a free-text participation role to the CvLAC tpo_participacion_proy code */
function inferParticipacionProy(p?: string): string {
  const s = (p ?? '').toLowerCase();
  if (s.includes('coinvest')) return 'CI';
  if (s.includes('asesor')) return 'AS';
  if (s.includes('doctor')) return 'ED';
  if (s.includes('maestr')) return 'EM';
  if (s.includes('pregrado') || s.includes('estudiante')) return 'EP';
  return 'IP'; // Investigador principal (default)
}

// ── Per-section form fillers (work for both create.do and edit.do) ────────────

async function fillFormacion(page: Page, edu: EducationItem, report: FillReport): Promise<void> {
  const defaults = loadConfig().defaults ?? {};

  await tryField(report, 'cod_nivel_formacion', () =>
    page.selectOption('select[name="cod_nivel_formacion"]', inferNivel(edu.degree))
  );
  await humanDelay(200, 500);

  await setInstitucion(page, report, edu.institution);
  await humanDelay(200, 500);

  await setMunicipio(page, report, defaults.municipio?.nombre, defaults.municipio?.codigoDane);
  await humanDelay(200, 400);

  await setReadonlyField(page, report, 'txt_nme_programa_acad', edu.degree, true);
  await setReadonlyField(page, report, 'txt_nme_titulo_obtenido', edu.degree);

  if (defaults.horasSemanales !== undefined) {
    await tryField(report, 'nro_horas_semanales', () =>
      page.fill('input[name="nro_horas_semanales"]', String(defaults.horasSemanales))
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
  await humanDelay(200, 400);
}

async function fillExperiencia(page: Page, exp: ExperienceItem, report: FillReport): Promise<void> {
  await setInstitucion(page, report, exp.company);
  await humanDelay(200, 500);

  const { start, end } = parsePeriod(exp.period);
  // Year fields may render as <select> or <input> depending on the form — try both.
  if (start) {
    const ok = await tryField(report, 'nro_ano_inicio (select)', () =>
      page.selectOption('select[name="nro_ano_inicio"]', start)
    );
    if (!ok) {
      report.warnings.pop();
      await tryField(report, 'nro_ano_inicio', () => page.fill('input[name="nro_ano_inicio"]', start));
    }
  }
  if (end) {
    const ok = await tryField(report, 'nro_ano_fin (select)', () =>
      page.selectOption('select[name="nro_ano_fin"]', end)
    );
    if (!ok) {
      report.warnings.pop();
      await tryField(report, 'nro_ano_fin', () => page.fill('input[name="nro_ano_fin"]', end));
    }
  }
  await humanDelay(200, 400);
}

async function fillCurso(page: Page, course: CourseItem, report: FillReport): Promise<void> {
  const defaults = loadConfig().defaults ?? {};

  await tryField(report, 'txt_nme_prod', () => page.fill('input[name="txt_nme_prod"]', course.name));
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
      page.fill('input[name="nro_duracion"]', String(course.duracionHoras))
    );
  }
  if (course.lugar) {
    await tryField(report, 'txt_lugar', () => page.fill('input[name="txt_lugar"]', course.lugar!));
  }

  const idioma = course.idioma ?? defaults.idioma;
  if (idioma) {
    await tryField(report, 'sgl_idioma', () => page.selectOption('select[name="sgl_idioma"]', idioma));
  } else {
    missingValue(report, 'sgl_idioma', 'define defaults.idioma en cvlac.config.json');
  }

  const pais = course.pais ?? defaults.pais;
  if (pais) {
    await tryField(report, 'sgl_pais', () => page.selectOption('select[name="sgl_pais"]', pais));
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
    page.fill('input[name="txt_nme_reconocimiento"]', ach.title)
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
    page.fill('input[name="txt_nme_proyecto"]', proj.title)
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

  await tryField(report, 'txt_acto_adm', () =>
    page.fill('input[name="txt_acto_adm"]', proj.nroActoAdministrativo ?? '0')
  );
  await setReadonlyField(
    page,
    report,
    'dta_acto_admString',
    proj.fechaActoAdministrativo ?? `01/01/${proj.startYear}`
  );
  await tryField(report, 'nro_valor', () =>
    page.fill('input[name="nro_valor"]', proj.valorSinContrapartida ?? '0')
  );
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

  await tryField(report, 'txt_nme_prod', () => page.fill('input[name="txt_nme_prod"]', sw.name));
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
      page.fill('input[name="txt_web_producto"]', sw.url!)
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

  await tryField(report, 'txt_nme_evento', () => page.fill('input[name="txt_nme_evento"]', ev.name));
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
  await setReadonlyField(page, report, 'dta_inicioString', ev.startDate);
  if (ev.endDate) await setReadonlyField(page, report, 'dta_finString', ev.endDate);
  await humanDelay(200, 400);

  await setMunicipio(
    page,
    report,
    ev.ciudad ?? defaults.municipio?.nombre,
    ev.codMunicipio ?? defaults.municipio?.codigoDane
  );
  await humanDelay(200, 400);

  if (ev.lugar) {
    await tryField(report, 'txt_lugar', () => page.fill('input[name="txt_lugar"]', ev.lugar!));
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

const SECTIONS: Record<CvLACSectionName, SectionConfig> = {
  formacion: {
    listUrl: URLS.formacion,
    createUrl: URLS.formacionCreate,
    matchCellIndex: 5,
    labelOf: (d: EducationItem) => d.degree,
    fill: fillFormacion,
  },
  experiencia: {
    listUrl: URLS.experiencia,
    createUrl: URLS.experienciaCreate,
    matchCellIndex: 1,
    labelOf: (d: ExperienceItem) => d.company,
    fill: fillExperiencia,
  },
  cursos: {
    listUrl: URLS.cursos,
    createUrl: URLS.cursosCreate,
    matchCellIndex: 1,
    labelOf: (d: CourseItem) => d.name,
    fill: fillCurso,
  },
  reconocimientos: {
    listUrl: URLS.reconocimientos,
    createUrl: URLS.reconocimientosCreate,
    matchCellIndex: 1,
    labelOf: (d: AchievementItem) => d.title,
    fill: fillReconocimiento,
  },
  proyectos: {
    listUrl: URLS.proyectos,
    createUrl: URLS.proyectosCreate,
    matchCellIndex: 1,
    labelOf: (d: ProjectItem) => d.title,
    fill: fillProyecto,
  },
  software: {
    listUrl: URLS.software,
    createUrl: URLS.softwareCreate,
    matchCellIndex: 1,
    labelOf: (d: SoftwareItem) => d.name,
    fill: fillSoftware,
  },
  eventos: {
    listUrl: URLS.eventos,
    createUrl: URLS.eventosCreate,
    matchCellIndex: 1,
    labelOf: (d: EventoCientificoItem) => d.name,
    fill: fillEvento,
  },
};

/**
 * Find the href of an action link (Detalles/Editar/Eliminar) for the list row whose
 * cell `matchCellIndex` matches `label` (accent/case/punctuation-insensitive).
 */
async function findRowActionHref(
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
  await humanDelay(400, 800);
  await clickGuardar(pageRef.page);
  const screenshotBase64 = await shot(pageRef.page);
  if (landedOnForm(pageRef.page)) {
    return failed(await describeRejection(pageRef.page, 'adding', label), report, screenshotBase64);
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
  await cfg.fill(pageRef.page, data, report);
  await humanDelay(400, 800);
  await clickGuardar(pageRef.page);
  const screenshotBase64 = await shot(pageRef.page);
  if (landedOnForm(pageRef.page)) {
    return failed(await describeRejection(pageRef.page, 'updating', label), report, screenshotBase64);
  }
  log.info('item updated', { label, warnings: report.warnings.length });
  return ok(`Updated: ${label}`, report, screenshotBase64);
}

async function deleteItem(pageRef: { page: Page }, cfg: SectionConfig, label: string): Promise<UpdateResult> {
  const report: FillReport = { warnings: [] };
  await gotoFormWithRelogin(pageRef, cfg.listUrl);
  const confirmHref = await findRowActionHref(pageRef.page, cfg.matchCellIndex, label, 'Eliminar');
  if (!confirmHref) {
    return failed(`No item matching "${label}" to delete`, report);
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
  await gotoFormWithRelogin(pageRef, BASE_URL + deleteHref);
  await gotoFormWithRelogin(pageRef, cfg.listUrl);
  const still = await findRowActionHref(pageRef.page, cfg.matchCellIndex, label, 'Eliminar');
  const screenshotBase64 = await shot(pageRef.page);
  if (still) {
    return failed(`Delete may have failed; "${label}" still present`, report, screenshotBase64);
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
