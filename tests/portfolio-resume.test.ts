import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  readTimelineEntries,
  readListEntries,
  toEducation,
  toExperience,
  parseCourseLine,
  readAchievements,
  readSkillGroups,
} from '../src/extractors/portfolio.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'portfolio');
// One per tab: only the open tab is in the DOM, so a fixture holding both would
// be a page the site never renders.
const TIMELINE = readFileSync(join(FIXTURES, 'resume-timeline.html'), 'utf8');
const COURSES = readFileSync(join(FIXTURES, 'resume-courses.html'), 'utf8');

// The portfolio was rewritten as a hash-routed React app whose content is JSX,
// not the data objects the old extractor regexed out of the bundle. It reads
// from the rendered DOM now, which is what a person sees.
describe('readTimelineEntries', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
  }, 60000);

  afterAll(async () => {
    await browser?.close();
  });

  it('reads the four parts of a timeline entry', async () => {
    await page.setContent(TIMELINE);
    const entries = await readTimelineEntries(page);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      date: 'Febrero 2024 - Actualidad',
      title: 'Universidad de los Andes',
      subtitle: 'Maestría en Inteligencia Artificial',
    });
  });

  it('keeps the bullets apart from the tags', async () => {
    await page.setContent(TIMELINE);
    const entry = (await readTimelineEntries(page))[1];
    expect(entry.bullets).toEqual([
      'Desarrollo de productos bancarios en la nube',
      'Manejo de DevOps y arquitectura',
    ]);
    expect(entry.tags).toEqual(['Python', 'AWS']);
  });

  it('reads the course lines, icon excluded', async () => {
    await page.setContent(COURSES);
    expect(await readListEntries(page)).toEqual([
      'Curso Práctico de Cloud Computing (Platzi) - Aprobado abril 2021',
      'Taller de Optimización (Universidad Ejemplo)',
    ]);
  });
});

describe('toEducation', () => {
  it('reads the institution from the title and the degree from the subtitle', () => {
    expect(
      toEducation({
        date: 'Agosto 2009 - Julio 2014',
        title: 'Universidad Simón Bolívar',
        subtitle: 'Ingeniería de Sistemas',
        bullets: ['Exaltación por el estudio de Gramalote'],
        tags: [],
      })
    ).toEqual({
      institution: 'Universidad Simón Bolívar',
      degree: 'Ingeniería de Sistemas',
      period: 'Agosto 2009 - Julio 2014',
      description: 'Exaltación por el estudio de Gramalote',
    });
  });
});

describe('toExperience', () => {
  it('reads company, role and modality, keeping bullets and tags', () => {
    expect(
      toExperience({
        date: 'Marzo 2021 - Julio 2025',
        title: 'Empresa Ejemplo S.A.',
        subtitle: 'Full Stack - Senior Developer',
        bullets: ['semi-presencial', 'Productos bancarios'],
        tags: ['Python'],
        modality: 'semi-presencial',
      })
    ).toMatchObject({
      company: 'Empresa Ejemplo S.A.',
      role: 'Full Stack - Senior Developer',
      period: 'Marzo 2021 - Julio 2025',
      modality: 'semi-presencial',
      technologies: ['Python'],
    });
  });
});

// Courses are one line each: a name, the provider in brackets, and sometimes
// the month it was approved.
describe('parseCourseLine', () => {
  it('separates the name, the provider and the date', () => {
    expect(parseCourseLine('Curso Práctico de Cloud Computing (Platzi) - Aprobado abril 2021')).toEqual({
      name: 'Curso Práctico de Cloud Computing (Platzi)',
      date: '2021-04',
      type: 'curso',
    });
  });

  it('leaves the date empty when the line does not carry one', () => {
    expect(parseCourseLine('Taller de Optimización (Universidad Ejemplo)')).toEqual({
      name: 'Taller de Optimización (Universidad Ejemplo)',
      date: '',
      type: 'curso',
    });
  });

  it('reads every Spanish month', () => {
    expect(parseCourseLine('X - Aprobado noviembre 2020').date).toBe('2020-11');
    expect(parseCourseLine('X - Aprobado julio 2020').date).toBe('2020-07');
  });

  it('refuses to invent a name from an empty line', () => {
    expect(parseCourseLine('   ')).toBeNull();
  });
});

describe('readAchievements and readSkillGroups', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
  }, 60000);

  afterAll(async () => {
    await browser?.close();
  });

  // reconocimientos is diffed against these. They came back empty after the
  // site was rewritten, so the diff compared CvLAC's awards against nothing.
  it('reads each achievement card as a title and its description', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'dashboard.html'), 'utf8'));
    expect(await readAchievements(page)).toEqual([
      { title: 'Exaltación Académica', description: 'Mención por trabajo social en un municipio.' },
      { title: 'Primer puesto hackatón', description: 'Ganador de la categoría de IA aplicada.' },
    ]);
  });

  it('ignores cards from any other section', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'dashboard.html'), 'utf8'));
    const titles = (await readAchievements(page)).map((a) => a.title);
    expect(titles).not.toContain('Un proyecto');
  });

  it('returns nothing when the section is not there, rather than guessing', async () => {
    await page.setContent('<section class="page-section"><p class="page-section-title">Otra</p></section>');
    expect(await readAchievements(page)).toEqual([]);
  });

  // The site groups skills its own way — eight groups, including Backend and
  // Herramientas — and those names are kept rather than squeezed into six
  // fixed buckets that no longer match anything on the page.
  it('reads the skills under the group names the site uses', async () => {
    await page.setContent(readFileSync(join(FIXTURES, 'resume-skills.html'), 'utf8'));
    expect(await readSkillGroups(page)).toEqual({
      Lenguajes: ['Python', 'Rust'],
      'Cloud & DevOps': ['AWS', 'Docker'],
    });
  });
});
