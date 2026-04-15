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
} from '../types.js';
import { URLS } from '../browser/navigation.js';

export async function updateSectionTool(req: UpdateRequest): Promise<UpdateResult> {
  await session.login();
  const page = await session.getPage();

  try {
    switch (req.section) {
      case 'formacion':
        return await addFormacion(page, req.data as EducationItem);
      case 'experiencia':
        return await addExperiencia(page, req.data as ExperienceItem);
      case 'cursos':
        return await addCurso(page, req.data as CourseItem);
      case 'reconocimientos':
        return await addReconocimiento(page, req.data as AchievementItem);
      default: {
        const _exhaustive: never = req.section;
        return { success: false, message: `Section "${_exhaustive}" not yet supported` };
      }
    }
  } catch (err) {
    const screenshotBase64 = await session.takeScreenshot(page);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg, screenshotBase64 };
  } finally {
    await page.close();
  }
}

async function clickIncluirNuevo(page: Page): Promise<void> {
  const link = page.getByText('Incluir nuevo ítem', { exact: false });
  await link.waitFor({ timeout: 10000 });
  await link.click();
  await page.waitForLoadState('domcontentloaded');
}

async function clickGuardar(page: Page): Promise<void> {
  const btn = page.getByRole('button', { name: /guardar|aceptar/i });
  await btn.waitFor({ timeout: 10000 });
  await btn.click();
  await page.waitForLoadState('domcontentloaded');
}

async function addFormacion(page: Page, edu: EducationItem): Promise<UpdateResult> {
  await page.goto(URLS.formacion, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await clickIncluirNuevo(page);

  const nivel = inferNivel(edu.degree);
  await page.selectOption('select[name*="nivel"], select[id*="nivel"]', { label: nivel });

  const instInput = page
    .locator('input[name*="institucion"], input[id*="institucion"]')
    .first();
  await instInput.fill(edu.institution);

  const progInput = page
    .locator('input[name*="programa"], input[id*="programa"]')
    .first();
  await progInput.fill(edu.degree);

  await clickGuardar(page);

  const screenshot = await session.takeScreenshot(page);
  return {
    success: true,
    message: `Added formación: ${edu.degree} @ ${edu.institution}`,
    screenshotBase64: screenshot,
  };
}

async function addExperiencia(page: Page, exp: ExperienceItem): Promise<UpdateResult> {
  await page.goto(URLS.experiencia, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await clickIncluirNuevo(page);

  const instInput = page
    .locator(
      'input[name*="institucion"], input[id*="empresa"], input[id*="entidad"]'
    )
    .first();
  await instInput.fill(exp.company);

  const cargoInput = page
    .locator('input[name*="cargo"], input[id*="cargo"], input[name*="rol"]')
    .first();
  await cargoInput.fill(exp.role);

  const periodParts = parsePeriod(exp.period);
  const inicioInput = page
    .locator('input[name*="inicio"], input[id*="inicio"]')
    .first();
  if (await inicioInput.isVisible()) await inicioInput.fill(periodParts.start);

  await clickGuardar(page);

  const screenshot = await session.takeScreenshot(page);
  return {
    success: true,
    message: `Added experiencia: ${exp.role} @ ${exp.company}`,
    screenshotBase64: screenshot,
  };
}

async function addCurso(page: Page, course: CourseItem): Promise<UpdateResult> {
  await page.goto(URLS.cursos, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await clickIncluirNuevo(page);

  const nameInput = page
    .locator(
      'input[name*="nombre"], input[id*="nombre"], textarea[name*="nombre"]'
    )
    .first();
  await nameInput.fill(course.name);

  const yearInput = page
    .locator('input[name*="anio"], input[id*="anio"], input[name*="year"]')
    .first();
  if (await yearInput.isVisible()) await yearInput.fill(course.date.slice(0, 4));

  await clickGuardar(page);

  const screenshot = await session.takeScreenshot(page);
  return {
    success: true,
    message: `Added curso: ${course.name}`,
    screenshotBase64: screenshot,
  };
}

async function addReconocimiento(page: Page, ach: AchievementItem): Promise<UpdateResult> {
  await page.goto(URLS.reconocimientos, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await clickIncluirNuevo(page);

  const titleInput = page
    .locator(
      'input[name*="nombre"], input[id*="nombre"], input[name*="titulo"]'
    )
    .first();
  await titleInput.fill(ach.title);

  const descInput = page
    .locator('textarea[name*="descripcion"], textarea[id*="descripcion"]')
    .first();
  if (await descInput.isVisible()) await descInput.fill(ach.description);

  await clickGuardar(page);

  const screenshot = await session.takeScreenshot(page);
  return {
    success: true,
    message: `Added reconocimiento: ${ach.title}`,
    screenshotBase64: screenshot,
  };
}

function inferNivel(degree: string): string {
  const d = degree.toLowerCase();
  if (d.includes('maestría') || d.includes('maestria') || d.includes('master'))
    return 'Maestría';
  if (d.includes('doctorado') || d.includes('phd')) return 'Doctorado';
  if (d.includes('especialización') || d.includes('especializacion'))
    return 'Especialización';
  if (d.includes('diplomado')) return 'Diplomado';
  return 'Universitaria';
}

function parsePeriod(period: string): { start: string; end: string } {
  const years = period.match(/\d{4}/g) ?? [];
  return { start: years[0] ?? '', end: years[1] ?? '' };
}
