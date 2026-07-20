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
 * Fetches the React bundle from the portfolio site and extracts structured data.
 * The bundle hash changes on deploy — we discover it by parsing the HTML first.
 */
export async function fetchPortfolioData(): Promise<PortfolioData> {
  const base = portfolioUrl();
  const htmlRes = await fetch(base);
  const html = await htmlRes.text();

  const bundleMatch = html.match(/src="(\.\/assets\/index-[^"]+\.js)"/);
  if (!bundleMatch) throw new Error(`Could not find React bundle URL in portfolio HTML at ${base}`);

  const bundleUrl = new URL(bundleMatch[1], base + '/').href;

  const bundleRes = await fetch(bundleUrl);
  const bundleText = await bundleRes.text();

  return normalizePortfolioData(bundleText, loadPortfolioExtra());
}

/**
 * Pure function: given the raw JS bundle text, extract structured PortfolioData.
 * Exported separately for unit testing without network calls.
 */
export function normalizePortfolioData(
  bundleText: string,
  extra: PortfolioExtra = EMPTY_EXTRA
): PortfolioData {
  return {
    personal: extractPersonal(bundleText),
    education: extractEducation(bundleText),
    experience: extractExperience(bundleText),
    courses: extractCourses(bundleText),
    achievements: extractAchievements(bundleText),
    projects: extra.projects,
    software: extra.software,
    eventos: extra.eventos,
    skills: extractSkills(bundleText),
  };
}

function extractPersonal(text: string): PortfolioData['personal'] {
  const candidates = [
    ...text.matchAll(/\{name:"([^"]+)",title:"([^"]+)",location:"([^"]+)"/g),
  ];
  if (candidates.length === 0) {
    log.warn('no personal block found in portfolio bundle');
    return { name: '', title: '', location: '' };
  }

  // A bundle can hold several {name,title,location} objects (team members, testimonials).
  // ownerNamePattern says which one belongs to the CV owner.
  const pattern = loadConfig().ownerNamePattern;
  const owner = pattern
    ? candidates.find((m) => m[1].toLowerCase().includes(pattern.toLowerCase()))
    : undefined;
  if (pattern && !owner) {
    log.warn('ownerNamePattern matched no personal block; using the first one', { pattern });
  }

  const m = owner ?? candidates[0];
  return { name: m[1], title: m[2], location: m[3] };
}

function extractEducation(text: string): EducationItem[] {
  const blocks = text.matchAll(
    /\{institution:"([^"]+)",degree:"([^"]+)",period:"([^"]*)"(?:,description:"([^"]*)")?\}/g
  );
  const items: EducationItem[] = [];
  for (const m of blocks) {
    items.push({ institution: m[1], degree: m[2], period: m[3], description: m[4] });
  }
  return items;
}

function extractExperience(text: string): ExperienceItem[] {
  const blocks = text.matchAll(
    /\{company:"([^"]+)",role:"([^"]+)",period:"([^"]+)",modality:"([^"]+)",description:\[([^\]]*)\](?:,technologies:\[([^\]]*)\])?\}/g
  );
  const items: ExperienceItem[] = [];
  for (const m of blocks) {
    const descriptions =
      (m[5] ?? '').match(/"([^"]*)"/g)?.map((s) => s.replace(/"/g, '')) ?? [];
    const technologies =
      (m[6] ?? '').match(/"([^"]*)"/g)?.map((s) => s.replace(/"/g, '')) ?? [];
    items.push({
      company: m[1],
      role: m[2],
      period: m[3],
      modality: m[4],
      description: descriptions,
      technologies,
    });
  }
  return items;
}

function extractCourses(text: string): CourseItem[] {
  const blocks = text.matchAll(
    /\{name:"([^"]+)",emoji:"([^"]*)",color:"([^"]*)",date:"([^"]+)",type:"([^"]+)"\}/g
  );
  const items: CourseItem[] = [];
  for (const m of blocks) {
    if (/^\d{4}-\d{2}$/.test(m[4])) {
      items.push({ name: m[1], emoji: m[2], color: m[3], date: m[4], type: m[5] });
    }
  }
  return items;
}

function extractAchievements(text: string): AchievementItem[] {
  const blocks = text.matchAll(/\{title:"([^"]+)",description:"([^"]+)"\}/g);
  const items: AchievementItem[] = [];
  for (const m of blocks) {
    if (m[2].length > 30) {
      items.push({ title: m[1], description: m[2] });
    }
  }
  return items;
}

function extractSkills(text: string): SkillsData {
  function extractArray(key: string): string[] {
    const m = text.match(new RegExp(`${key}:\\[([^\\]]+)\\]`));
    if (!m) return [];
    return (m[1].match(/"([^"]+)"/g) ?? []).map((s) => s.replace(/"/g, ''));
  }
  return {
    languages: extractArray('languages'),
    frontend: extractArray('frontend'),
    ai: extractArray('ai'),
    cloud: extractArray('cloud'),
    devops: extractArray('devops'),
    databases: extractArray('databases'),
  };
}
