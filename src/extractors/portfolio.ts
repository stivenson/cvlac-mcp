import type {
  PortfolioData,
  EducationItem,
  ExperienceItem,
  CourseItem,
  AchievementItem,
  SkillsData,
} from '../types.js';

const PORTFOLIO_URL = process.env.PORTFOLIO_URL ?? 'https://stivenson.github.io';

/**
 * Fetches the React bundle from the portfolio site and extracts structured data.
 * The bundle hash changes on deploy — we discover it by parsing the HTML first.
 */
export async function fetchPortfolioData(): Promise<PortfolioData> {
  const htmlRes = await fetch(PORTFOLIO_URL);
  const html = await htmlRes.text();

  const bundleMatch = html.match(/src="(\.\/assets\/index-[^"]+\.js)"/);
  if (!bundleMatch) throw new Error('Could not find React bundle URL in portfolio HTML');

  const bundleUrl = new URL(bundleMatch[1], PORTFOLIO_URL + '/').href;

  const bundleRes = await fetch(bundleUrl);
  const bundleText = await bundleRes.text();

  return normalizePortfolioData(bundleText);
}

/**
 * Pure function: given the raw JS bundle text, extract structured PortfolioData.
 * Exported separately for unit testing without network calls.
 */
export function normalizePortfolioData(bundleText: string): PortfolioData {
  return {
    personal: extractPersonal(bundleText),
    education: extractEducation(bundleText),
    experience: extractExperience(bundleText),
    courses: extractCourses(bundleText),
    achievements: extractAchievements(bundleText),
    skills: extractSkills(bundleText),
  };
}

function extractPersonal(text: string): PortfolioData['personal'] {
  const m = text.match(/\{name:"(Stivenson[^"]+)",title:"([^"]+)",location:"([^"]+)"/);
  if (!m) return { name: 'Stivenson Rincón Mora', title: '', location: '' };
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
