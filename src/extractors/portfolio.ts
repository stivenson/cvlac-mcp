import { chromium, type Page } from 'playwright';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type {
  PortfolioData,
  EducationItem,
  ExperienceItem,
  CourseItem,
  AchievementItem,
  SkillsData,
} from '../types.js';
import { loadConfig, portfolioUrl, SERVER_ROOT } from '../config.js';
import { portfolioExtraSchema, formatIssues, type PortfolioExtra } from '../schemas.js';
import { createLogger } from '../logger.js';
import { z } from 'zod';

const log = createLogger('portfolio');

const EMPTY_EXTRA: PortfolioExtra = { projects: [], software: [], eventos: [] };

/** Resolved per call so the environment can change between calls (and in tests). */
function extraPath(): string {
  return process.env.CVLAC_PORTFOLIO_EXTRA_PATH ?? join(SERVER_ROOT, 'data', 'portfolio-extra.json');
}

/**
 * Loads proyectos/software/eventos from data/portfolio-extra.json.
 *
 * These three categories are not parsed from the portfolio bundle: they need
 * CvLAC-specific metadata (tipoProyecto, codMunicipio, enum codes) that a
 * portfolio site has no reason to carry. They are curated by hand instead.
 */
export function loadPortfolioExtra(): PortfolioExtra {
  const path = extraPath();
  if (!existsSync(path)) {
    log.warn('no portfolio-extra file; proyectos/software/eventos will be empty', { path });
    return EMPTY_EXTRA;
  }
  try {
    const parsed = portfolioExtraSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
    log.info('portfolio-extra loaded', {
      path,
      projects: parsed.projects.length,
      software: parsed.software.length,
      eventos: parsed.eventos.length,
    });
    return parsed;
  } catch (err) {
    const detail = err instanceof z.ZodError ? formatIssues(err) : String(err);
    log.error('portfolio-extra is invalid; ignoring it', { path, detail });
    return EMPTY_EXTRA;
  }
}

/**
 * Reads the portfolio by rendering it.
 *
 * It used to download `assets/index-*.js` and regex the data objects out of the
 * bundle. The site was rewritten as a hash-routed React app whose content is
 * JSX, so `{institution:"…"}` and its siblings no longer exist: every section
 * came back empty, without an error, and the diff quietly had nothing to
 * compare. What a person sees is now what gets read.
 */
export async function fetchPortfolioData(): Promise<PortfolioData> {
  const base = portfolioUrl().replace(/\/+$/, '');
  const extra = loadPortfolioExtra();

  // A browser of its own: the CvLAC session must not carry its cookies to a
  // third-party site, and nothing here needs to be logged in.
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/#/resume`, { waitUntil: 'networkidle', timeout: 60000 });
    await page
      .waitForSelector('.rf-tabpanel-content .rf-timeline-item', { timeout: 20000 })
      .catch(() => {
        log.warn('the portfolio rendered no timeline items; its markup may have changed', { base });
      });

    // The résumé is tabbed and only the open tab is in the DOM, so each one has
    // to be opened. Experiencia is the one that opens by default.
    const experience = (await readTimelineEntries(page)).map(toExperience);
    const education = (await openTab(page, 'Educación'))
      ? (await readTimelineEntries(page)).map(toEducation)
      : [];
    const courses = (await openTab(page, 'Cursos'))
      ? (await readListEntries(page)).map(parseCourseLine).filter((c): c is CourseItem => c !== null)
      : [];

    const personal = await readPersonal(page);
    log.info('portfolio rendered', {
      experience: experience.length,
      education: education.length,
      courses: courses.length,
    });

    return {
      personal,
      education,
      experience,
      courses,
      // Not read from the rendered site yet: the dashboard lays them out its own
      // way. Empty rather than guessed — an empty list makes the diff report
      // nothing, which writes nothing.
      achievements: [] as AchievementItem[],
      projects: extra.projects,
      software: extra.software,
      eventos: extra.eventos,
      skills: { languages: [], frontend: [], ai: [], cloud: [], devops: [], databases: [] },
    };
  } finally {
    await browser.close();
  }
}

/** Clicks one of the résumé tabs, reporting rather than throwing if it is gone. */
async function openTab(page: Page, name: string): Promise<boolean> {
  try {
    await page.getByRole('button', { name, exact: true }).click({ timeout: 10000 });
    await page.waitForTimeout(800);
    return true;
  } catch {
    log.warn('the portfolio has no such résumé tab', { tab: name });
    return false;
  }
}

/** The header bar reads "Nombre | Cargo", after a shell prompt that is decoration. */
async function readPersonal(page: Page): Promise<PortfolioData['personal']> {
  const title = await page
    .$eval('.rf-header-title', (el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
    .catch(() => '');
  const [rawName = '', role = ''] = title.split('|').map((part) => part.trim());
  return { name: rawName.replace(/^[^\p{L}]+/u, '').trim(), title: role, location: '' };
}

export interface TimelineEntry {
  date: string;
  title: string;
  subtitle: string;
  bullets: string[];
  tags: string[];
  /** The pill above the bullets on an experience entry: remoto, presencial… */
  modality?: string;
}

/**
 * Experience and education both render as `.rf-timeline-item`.
 *
 * No named helper inside the callback: the dev runner compiles with esbuild's
 * keepNames, which wraps a function assigned to a variable in a `__name` call
 * that does not exist in the page. It throws only outside the test runner.
 */
export async function readTimelineEntries(page: Page): Promise<TimelineEntry[]> {
  return page.$$eval('.rf-tabpanel-content .rf-timeline-item', (items) =>
    items.map((item) => ({
      date: (item.querySelector('.rf-timeline-date')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      title: (item.querySelector('.rf-timeline-title')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      subtitle: (item.querySelector('.rf-timeline-subtitle')?.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
      bullets: Array.from(item.querySelectorAll('.rf-timeline-content li')).map((li) =>
        (li.textContent ?? '').replace(/\s+/g, ' ').trim()
      ),
      tags: Array.from(item.querySelectorAll('.rf-tag')).map((tag) =>
        (tag.textContent ?? '').replace(/\s+/g, ' ').trim()
      ),
      modality:
        (item.querySelector('.rf-timeline-content p span')?.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim() || undefined,
    }))
  );
}

/**
 * Courses and academic projects: one row each, with no class of their own.
 *
 * They are plain divs with inline styles — an emoji span and the text — so they
 * are found by position inside the open tab. Scoping matters: the sidebar's own
 * links carry `.rf-tree-item`, and reading those turned "Dashboard" and
 * "Artículos" into courses.
 */
export async function readListEntries(page: Page): Promise<string[]> {
  return page.$$eval('.rf-tabpanel-content > div > div', (rows) =>
    rows
      .map((row) => (row.textContent ?? '').replace(/\s+/g, ' ').trim())
      .map((text) => text.replace(/^[^\p{L}\d]+/u, '').trim())
      .filter(Boolean)
  );
}

export function toEducation(entry: TimelineEntry): EducationItem {
  return {
    institution: entry.title,
    degree: entry.subtitle,
    period: entry.date,
    description: entry.bullets.join(' ') || undefined,
  };
}

export function toExperience(entry: TimelineEntry): ExperienceItem {
  // The modality pill is also the first bullet in the rendered text, so it is
  // dropped from the description rather than repeated in it.
  return {
    company: entry.title,
    role: entry.subtitle,
    period: entry.date,
    modality: entry.modality ?? '',
    description: entry.bullets.filter((bullet) => bullet !== entry.modality),
    technologies: entry.tags,
  };
}

const MONTHS: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
};

/**
 * One course line: a name, its provider in brackets, sometimes an approval date.
 *
 * The date is only taken when the line states it. A course whose line says
 * nothing keeps an empty date, which the diff reads as "no year to compare"
 * rather than as this year.
 */
export function parseCourseLine(line: string): CourseItem | null {
  const text = (line ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const approved = /-\s*Aprobado\s+([a-záéíóúñ]+)\s+(\d{4})\s*$/i.exec(text);
  const name = approved ? text.slice(0, approved.index).replace(/\s*-\s*$/, '').trim() : text;
  const month = approved ? MONTHS[approved[1].toLowerCase()] : undefined;

  return { name, date: approved && month ? `${approved[2]}-${month}` : '', type: 'curso' };
}
