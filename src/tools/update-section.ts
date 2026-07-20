import type { Page } from 'playwright';
import { session } from '../browser/session.js';
import type {
  UpdateRequest,
  UpdateResult,
  CvLACSectionName,
  EducationItem,
  ExperienceItem,
  CourseItem,
  AchievementItem,
  ProjectItem,
  SoftwareItem,
  EventoCientificoItem,
} from '../types.js';
import { BASE_URL, URLS } from '../browser/navigation.js';

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

/** Search CvLAC institution API and return the matching id only on exact match */
async function findInstitucionId(page: Page, name: string): Promise<{ id: number; nme: string }> {
  // Try progressively shorter search terms: full name, then each word (longest first)
  const searchTerms = [name, ...name.split(/\s+/).filter(w => w.length > 4).sort((a, b) => b.length - a.length)];

  for (const term of searchTerms) {
    const url = `${BASE_URL}/cvlac/json/EnInstitucion/buscar.do?txt_nombre=${encodeURIComponent(term)}`;

    const response = await page.evaluate(async (fetchUrl: string) => {
      const res = await fetch(fetchUrl, { credentials: 'include' });
      if (!res.ok) return { ok: false, items: [] as unknown[] };
      const buf = await res.arrayBuffer();
      const text = new TextDecoder('latin1').decode(buf);
      try { return { ok: true, items: JSON.parse(text) }; } catch { return { ok: true, items: [] }; }
    }, url);

    if (!response.ok) return { id: 0, nme: name };

    const items = response.items as Array<{ id: number; nmeInst: string }>;
    if (!Array.isArray(items) || items.length === 0) continue;

    const normQuery = normStr(name);

    const exact = items.find(r => normStr(r.nmeInst) === normQuery);
    if (exact) return { id: exact.id, nme: exact.nmeInst };

    const partial = items.find(r => {
      const n = normStr(r.nmeInst);
      return n.includes(normQuery) || normQuery.includes(n);
    });
    if (partial) return { id: partial.id, nme: partial.nmeInst };

    return { id: 0, nme: name };
  }

  return { id: 0, nme: name };
}

/** Set a readonly institution picker (hidden id + visible readonly name) using the search API */
async function setInstitucionFields(
  page: Page,
  name: string,
  idField: string,
  nmeField: string
): Promise<void> {
  const { id, nme } = await findInstitucionId(page, name);
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
    { instId: id, instNme: nme, idF: idField, nmeF: nmeField }
  );
}

/** Default institution picker used by formación / eventos (id_institucion + txt_nme_institucion) */
async function setInstitucion(page: Page, name: string): Promise<void> {
  await setInstitucionFields(page, name, 'id_institucion', 'txt_nme_institucion');
}

/** Remove readonly from any field and set its value via JS */
async function forceSetReadonly(page: Page, fieldId: string, value: string): Promise<void> {
  await page.evaluate(
    ({ id, val }) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (!el) return;
      el.removeAttribute('readonly');
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    { id: fieldId, val: value }
  );
}

/** Set a readonly field selected by name attribute (some forms have no id) */
async function forceSetReadonlyByName(page: Page, fieldName: string, value: string): Promise<void> {
  await page.evaluate(
    ({ name, val }) => {
      const el = document.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
      if (!el) return;
      el.removeAttribute('readonly');
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    { name: fieldName, val: value }
  );
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
async function gotoFormWithRelogin(
  pageRef: { page: Page },
  url: string
): Promise<void> {
  try {
    await gotoForm(pageRef.page, url);
  } catch (err) {
    if (!(err instanceof SessionExpiredError)) throw err;
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
  const btn = page.getByRole('button', { name: /guardar|aceptar|enviar|save|borrar/i });
  await btn.waitFor({ timeout: 10000 });
  await btn.click();
  await page.waitForLoadState('domcontentloaded');
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

async function fillFormacion(page: Page, edu: EducationItem): Promise<void> {
  await page.selectOption('select[name="cod_nivel_formacion"]', inferNivel(edu.degree)).catch(() => {});
  await humanDelay(200, 500);
  await setInstitucion(page, edu.institution);
  await humanDelay(200, 500);
  // Municipio (*) — required, inject Cúcuta (54001) as default
  await page.evaluate(() => {
    const textEl = document.querySelector('input[name="cod_municipio_text"]') as HTMLInputElement | null;
    if (textEl) {
      textEl.removeAttribute('readonly');
      textEl.value = 'Cúcuta';
      const suffix = textEl.id.replace('_loc_', '');
      const hiddenEl = document.getElementById('_locValue_' + suffix) as HTMLInputElement | null;
      if (hiddenEl) hiddenEl.value = '54001';
    }
    const all = Array.from(document.querySelectorAll('input[name="cod_municipio"]')) as HTMLInputElement[];
    for (const el of all) el.value = '54001';
  });
  await humanDelay(200, 400);
  await forceSetReadonly(page, 'txt_nme_programa_acad', edu.degree);
  await forceSetReadonlyByName(page, 'txt_nme_titulo_obtenido', edu.degree).catch(() => {});
  // Intensidad horaria (*) — required, default 1
  await page.fill('input[name="nro_horas_semanales"]', '1').catch(() => {});
  const { start, end } = parsePeriod(edu.period);
  if (start) await page.selectOption('select[name="nro_ano_inicio"]', start).catch(() => {});
  if (end) await page.selectOption('select[name="nro_ano_obten"]', end).catch(() => {});
  await humanDelay(200, 400);
}

async function fillExperiencia(page: Page, exp: ExperienceItem): Promise<void> {
  await setInstitucion(page, exp.company);
  await humanDelay(200, 500);
  const { start, end } = parsePeriod(exp.period);
  // Year fields may render as <select> or <input> depending on the form — try both.
  if (start) {
    await page.selectOption('select[name="nro_ano_inicio"]', start).catch(async () => {
      await page.fill('input[name="nro_ano_inicio"]', start).catch(() => {});
    });
  }
  if (end) {
    await page.selectOption('select[name="nro_ano_fin"]', end).catch(async () => {
      await page.fill('input[name="nro_ano_fin"]', end).catch(() => {});
    });
  }
  await humanDelay(200, 400);
}

async function fillCurso(page: Page, course: CourseItem): Promise<void> {
  await page.fill('input[name="txt_nme_prod"]', course.name);
  await humanDelay(200, 500);
  const year = course.date?.slice(0, 4) ?? '';
  const month = course.date?.slice(5, 7) ?? '';
  if (year) await page.selectOption('select[name="nro_ano_presenta"]', year).catch(() => {});
  if (month) {
    await page.selectOption('select[name="nro_mes_presenta"]', String(parseInt(month, 10))).catch(() => {});
  }
  await humanDelay(200, 400);
}

async function fillReconocimiento(page: Page, ach: AchievementItem): Promise<void> {
  await page.fill('input[name="txt_nme_reconocimiento"]', ach.title);
  await humanDelay(200, 400);
  // Fecha de obtención (*) — required, default current year
  const year = String(new Date().getFullYear());
  await page.selectOption('select[name="nro_ano_obtencion"]', year).catch(() => {});
  await humanDelay(200, 300);
}

async function fillProyecto(page: Page, proj: ProjectItem): Promise<void> {
  // Tipo de proyecto (radio)
  await page.click(`input[name="tpo_proyecto"][value="${proj.tipoProyecto}"]`).catch(() => {});
  await humanDelay(200, 400);

  await page.fill('input[name="txt_nme_proyecto"]', proj.title);
  await humanDelay(200, 400);

  await page.selectOption('select[name="nro_ano_inicio"]', proj.startYear).catch(() => {});
  await page.selectOption('select[name="nro_mes_inicio"]', proj.startMonth).catch(() => {});
  if (proj.endYear) await page.selectOption('select[name="nro_ano_fin"]', proj.endYear).catch(() => {});
  if (proj.endMonth) await page.selectOption('select[name="nro_mes_fin"]', proj.endMonth).catch(() => {});
  await humanDelay(200, 400);

  // Participación (select, real field name verified live): tpo_participacion_proy
  await page
    .selectOption('select[name="tpo_participacion_proy"]', inferParticipacionProy(proj.participacion))
    .catch(() => {});
  await humanDelay(200, 400);

  // Institución principal (*) — required; fall back to Uniandes if not specified
  const instName = proj.institution ?? 'Universidad de los Andes';
  await setInstitucionFields(page, instName, 'id_inst', 'nme_inst');
  await humanDelay(200, 400);

  // Financiación (real field names verified live)
  const tipoFin = proj.tipoFinanciacion ?? 'SO';
  await page.click(`input[name="tpo_financiacion"][value="${tipoFin}"]`).catch(() => {});
  await humanDelay(200, 300);
  if (tipoFin === 'FI') {
    await page
      .click(`input[name="tpo_fuente_finan"][value="${proj.fuenteFinanciacion ?? 'I'}"]`)
      .catch(() => {});
    // tpo_rol select: F=Financiadora, E=Ejecutora, C=Coejecutora
    const rol = proj.tipoParticipacionInstitucion === 'FI' ? 'F' : 'E';
    await page.selectOption('select[name="tpo_rol"]', rol).catch(() => {});
    await humanDelay(200, 300);
  }

  // Acto administrativo (dta_acto_admString is readonly → inject via JS) and valor
  await page.fill('input[name="txt_acto_adm"]', proj.nroActoAdministrativo ?? '0').catch(() => {});
  await forceSetReadonlyByName(
    page,
    'dta_acto_admString',
    proj.fechaActoAdministrativo ?? `01/01/${proj.startYear}`
  ).catch(() => {});
  await page.fill('input[name="nro_valor"]', proj.valorSinContrapartida ?? '0').catch(() => {});
  await humanDelay(200, 400);

  await page.fill('textarea[name="txt_resumen_proyecto"]', proj.description).catch(() => {});
  await humanDelay(200, 400);
}

async function fillSoftware(page: Page, sw: SoftwareItem): Promise<void> {
  // Tipo de software (radio: 211=Computacional, 212=Multimedia, 219=Otra)
  await page.click(`input[name="cod_tipo_producto"][value="${sw.tipoSoftware ?? '211'}"]`).catch(() => {});
  await humanDelay(200, 400);

  await page.fill('input[name="txt_nme_prod"]', sw.name);
  await humanDelay(200, 400);

  await page.selectOption('select[name="nro_ano_presenta"]', sw.year).catch(() => {});
  if (sw.month) await page.selectOption('select[name="nro_mes_presenta"]', sw.month).catch(() => {});
  await humanDelay(200, 400);

  if (sw.url) {
    await page.fill('input[name="txt_web_producto"]', sw.url).catch(() => {});
    await humanDelay(200, 300);
  }

  // Sin registro/patente/secreto: "Ninguno" to skip mandatory registry fields
  await page.click('input[name="tpo_prod_tiene"][value="N"]').catch(() => {});
  await humanDelay(400, 600);

  // Mandatory technical description textareas (verified live).
  const desc = sw.name;
  for (const name of ['txt_analisis', 'txt_desarrollo', 'txt_implementacion', 'txt_validacion', 'txt_plataforma', 'txt_ambiente']) {
    await page.fill(`textarea[name="${name}"]`, desc).catch(() => {});
    await humanDelay(80, 160);
  }
  await humanDelay(200, 400);
}

async function fillEvento(page: Page, ev: EventoCientificoItem): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => {});
  await humanDelay(400, 800);

  await page.fill('input[name="txt_nme_evento"]', ev.name);
  await humanDelay(200, 400);

  if (ev.tipoEvento) await page.selectOption('select[name="tpo_evento"]', ev.tipoEvento).catch(() => {});
  if (ev.ambito) await page.selectOption('select[name="tpo_clasificacion"]', ev.ambito).catch(() => {});
  await humanDelay(200, 400);

  // Dates are readonly → inject via JS
  await forceSetReadonlyByName(page, 'dta_inicioString', ev.startDate).catch(() => {});
  if (ev.endDate) await forceSetReadonlyByName(page, 'dta_finString', ev.endDate).catch(() => {});
  await humanDelay(200, 400);

  // Ciudad/Municipio — readonly text with dynamic id _loc_NNNNN / _locValue_NNNNN
  const munCode = ev.codMunicipio ?? '54001';
  const munText = ev.ciudad ?? 'Cúcuta';
  await page.evaluate(({ code, text }) => {
    const textEl = document.querySelector('input[name="cod_municipio_text"]') as HTMLInputElement | null;
    if (textEl) {
      textEl.removeAttribute('readonly');
      textEl.value = text;
      const suffix = textEl.id.replace('_loc_', '');
      const hiddenEl = document.getElementById('_locValue_' + suffix) as HTMLInputElement | null;
      if (hiddenEl) hiddenEl.value = code;
    }
    const allCodMun = Array.from(document.querySelectorAll('input[name="cod_municipio"]')) as HTMLInputElement[];
    for (const el of allCodMun) el.value = code;
  }, { code: munCode, text: munText });
  await humanDelay(200, 400);

  if (ev.lugar) await page.fill('input[name="txt_lugar"]', ev.lugar).catch(() => {});
  await humanDelay(200, 300);

  // Rol (checkbox) — default Ponente
  const rolMap: Record<string, string> = {
    PO: 'input[name="tpo_part_ponente"]',
    PM: 'input[name="tpo_part_ponenteMag"]',
    OR: 'input[name="tpo_part_organizador"]',
    AS: 'input[name="tpo_part_asistente"]',
  };
  const rolSel = rolMap[ev.rol ?? 'PO'];
  if (rolSel) await page.check(rolSel).catch(() => {});
  await humanDelay(200, 400);

  if (ev.institution) {
    await setInstitucion(page, ev.institution);
    await humanDelay(200, 400);
  }

  if (ev.resumen) await page.fill('textarea[name="txt_resumen_evento"]', ev.resumen).catch(() => {});
  await humanDelay(200, 400);
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
  fill: (page: Page, data: any) => Promise<void>;
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

async function addItem(pageRef: { page: Page }, cfg: SectionConfig, data: unknown, label: string): Promise<UpdateResult> {
  await gotoFormWithRelogin(pageRef, cfg.createUrl);
  await humanDelay();
  await cfg.fill(pageRef.page, data);
  await humanDelay(400, 800);
  await clickGuardar(pageRef.page);
  const screenshotBase64 = await shot(pageRef.page);
  if (landedOnForm(pageRef.page)) {
    return { success: false, message: `Form validation failed adding "${label}"`, screenshotBase64 };
  }
  return { success: true, message: `Added: ${label}`, screenshotBase64 };
}

async function updateItem(pageRef: { page: Page }, cfg: SectionConfig, data: unknown, label: string): Promise<UpdateResult> {
  await gotoFormWithRelogin(pageRef, cfg.listUrl);
  const editHref = await findRowActionHref(pageRef.page, cfg.matchCellIndex, label, 'Editar');
  if (!editHref) {
    return { success: false, message: `No existing item matching "${label}" to update` };
  }
  await gotoFormWithRelogin(pageRef, BASE_URL + editHref);
  await humanDelay();
  await cfg.fill(pageRef.page, data);
  await humanDelay(400, 800);
  await clickGuardar(pageRef.page);
  const screenshotBase64 = await shot(pageRef.page);
  if (landedOnForm(pageRef.page)) {
    return { success: false, message: `Form validation failed updating "${label}"`, screenshotBase64 };
  }
  return { success: true, message: `Updated: ${label}`, screenshotBase64 };
}

async function deleteItem(pageRef: { page: Page }, cfg: SectionConfig, label: string): Promise<UpdateResult> {
  await gotoFormWithRelogin(pageRef, cfg.listUrl);
  const confirmHref = await findRowActionHref(pageRef.page, cfg.matchCellIndex, label, 'Eliminar');
  if (!confirmHref) {
    return { success: false, message: `No item matching "${label}" to delete` };
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
    return { success: false, message: `Confirm page had no Borrar/delete link for "${label}"`, screenshotBase64 };
  }
  await gotoFormWithRelogin(pageRef, BASE_URL + deleteHref);
  await gotoFormWithRelogin(pageRef, cfg.listUrl);
  const still = await findRowActionHref(pageRef.page, cfg.matchCellIndex, label, 'Eliminar');
  const screenshotBase64 = await shot(pageRef.page);
  if (still) {
    return { success: false, message: `Delete may have failed; "${label}" still present`, screenshotBase64 };
  }
  return { success: true, message: `Deleted: ${label}`, screenshotBase64 };
}

export async function updateSectionTool(req: UpdateRequest): Promise<UpdateResult> {
  await session.login();
  const pageRef = { page: await session.getPage() };

  const cfg = SECTIONS[req.section];
  if (!cfg) {
    await pageRef.page.close();
    return { success: false, message: `Section "${req.section}" not supported` };
  }

  try {
    const label = cfg.labelOf(req.data);
    switch (req.action) {
      case 'add':
        return await addItem(pageRef, cfg, req.data, label);
      case 'update':
        return await updateItem(pageRef, cfg, req.data, label);
      case 'delete':
        return await deleteItem(pageRef, cfg, label);
      default: {
        const _exhaustive: never = req.action;
        return { success: false, message: `Action "${String(_exhaustive)}" not supported` };
      }
    }
  } catch (err) {
    const screenshotBase64 = await shot(pageRef.page);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg, screenshotBase64 };
  } finally {
    await pageRef.page.close();
  }
}
