import type {
  PortfolioData,
  EducationItem,
  ExperienceItem,
  CourseItem,
  AchievementItem,
  ProjectItem,
  SoftwareItem,
  EventoCientificoItem,
  SkillsData,
} from '../types.js';

// NOTE: projects/software/eventos are NOT parsed from the portfolio React bundle.
// The bundle only exposes clean arrays for education/experience/courses/achievements/skills;
// these three categories require CvLAC-specific metadata (tipoProyecto, codMunicipio, enum
// codes, etc.) that the portfolio doesn't carry. They are curated here by hand and kept in
// sync manually. Verified live (docs/cvlac-findings.md): the current STATIC entries already
// exist in CvLAC, so the diff reports them as up to date.
const STATIC_EVENTOS: EventoCientificoItem[] = [
  {
    name: 'Congreso de Ingeniería Multimedia - Universidad Simón Bolívar',
    startDate: '01/04/2025',
    endDate: '01/04/2025',
    lugar: 'Universidad Simón Bolívar',
    ciudad: 'Cúcuta',
    tipoEvento: 'TA',
    ambito: 'N',
    rol: 'PO',
    institution: 'Universidad Simón Bolívar',
    resumen: 'Taller: Inteligencia Artificial en el Frontend. Taller práctico de 1.5 horas para estudiantes de Ingeniería Multimedia sobre el uso de herramientas de IA generativa en desarrollo web, incluyendo prompt engineering, generación de componentes con v0.dev y Google AI Studio.',
  },
];

const STATIC_SOFTWARE: SoftwareItem[] = [
  {
    name: 'Soporte en Crisis TOC - Emotion Game',
    year: '2025',
    month: '1',
    tipoSoftware: '211',
    url: 'https://stivenson.github.io/toc_support.html',
  },
  {
    name: 'Directorio de Interfaces LLM',
    year: '2025',
    month: '1',
    tipoSoftware: '211',
    url: 'https://stivenson.github.io/llm-directory.html',
  },
  {
    name: 'cvlac-mcp - MCP Server para automatización de CvLAC',
    year: '2025',
    month: '4',
    tipoSoftware: '211',
    url: 'https://github.com/stivenson/cvlac-mcp',
  },
];

const STATIC_PROJECTS: ProjectItem[] = [
  {
    title: 'Soporte en Crisis TOC - Emotion Game',
    description:
      'Herramienta digital no clínica de psicoeducación y autorregulación emocional para el Trastorno Obsesivo Compulsivo (TOC), con integración de Large Language Models para scaffolding cognitivo y navegación de estados internos.',
    tipoProyecto: 'EX',
    startYear: '2025',
    startMonth: '1',
    link: 'https://stivenson.github.io/toc_support.html',
  },
  {
    title: 'Directorio de Interfaces LLM',
    description:
      'Directorio curado y categorizado de interfaces de inteligencia artificial incluyendo chats conversacionales, editores, agentes, herramientas de datos, imágenes, video, audio, código, flujos de trabajo y diseño.',
    tipoProyecto: 'EX',
    startYear: '2025',
    startMonth: '1',
    link: 'https://stivenson.github.io/llm-directory.html',
  },
  {
    title: 'Aplicaciones de IA a problemas regionales - Maestría en IA Uniandes',
    description:
      'Proyectos de investigación y desarrollo en el marco de la Maestría en Inteligencia Artificial de la Universidad de los Andes, con enfoque en aplicar IA a problemas reales de la región colombiana.',
    tipoProyecto: 'ID',
    startYear: '2024',
    startMonth: '2',
    institution: 'Universidad de los Andes',
  },
];

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
    projects: STATIC_PROJECTS,
    software: STATIC_SOFTWARE,
    eventos: STATIC_EVENTOS,
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
