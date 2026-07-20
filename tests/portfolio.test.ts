import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { normalizePortfolioData, loadPortfolioExtra } from '../src/extractors/portfolio.js';
import { resetConfigCache } from '../src/config.js';

// Fictional bundles — the repo is public, so no real CV records live in tests.
const BUNDLE = {
  education: `
    {institution:"Universidad Nacional de Colombia",degree:"Maestría en Ciencia de Datos",period:"Febrero 2018 - Diciembre 2020",description:"Enfoque en analítica"}
    {institution:"Universidad de Antioquia",degree:"Ingeniería de Sistemas",period:"Agosto 2010 - Julio 2015",description:"Mención"}
  `,
  experience: `
    {company:"Empresa Ejemplo (Grupo Ficticio)",role:"Full Stack - Senior Developer",period:"Marzo 2021 - Julio 2025",modality:"semi-presencial",description:["Desarrollo de productos"],technologies:["Python"]}
  `,
  courses: `
    {name:"Taller de Introducción a la Programación (UNAL)",emoji:"📋",color:"#1976D2",date:"2024-11",type:"taller"}
    {name:"Curso Práctico de Cómputo en la Nube (Academia) - Aprobado abril 2022",emoji:"📚",color:"#7CB342",date:"2022-04",type:"curso"}
  `,
  achievements: `
    {title:"Mención de Honor en Innovación",description:"Otorgada por el proyecto de analítica regional del programa"}
  `,
  skills: `languages:["Python","JavaScript"] frontend:["React"] ai:["LLMs"] cloud:["AWS"] devops:["Docker"] databases:["PostgreSQL"]`,
  personal: `{name:"Ana Ejemplo",title:"Ingeniera de Sistemas",location:"Bogotá, Colombia"}`,
};

const savedEnv = { ...process.env };
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cvlac-portfolio-'));
  resetConfigCache();
  delete process.env.CVLAC_CONFIG_PATH;
  delete process.env.CVLAC_PORTFOLIO_EXTRA_PATH;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  process.env = { ...savedEnv };
  resetConfigCache();
});

describe('normalizePortfolioData', () => {
  it('extracts education items from raw JS bundle text', () => {
    const result = normalizePortfolioData(BUNDLE.education);
    expect(result.education).toHaveLength(2);
    expect(result.education[0].institution).toBe('Universidad Nacional de Colombia');
    expect(result.education[0].degree).toBe('Maestría en Ciencia de Datos');
  });

  it('extracts experience items including description and technologies', () => {
    const result = normalizePortfolioData(BUNDLE.experience);
    expect(result.experience).toHaveLength(1);
    expect(result.experience[0].company).toBe('Empresa Ejemplo (Grupo Ficticio)');
    expect(result.experience[0].role).toBe('Full Stack - Senior Developer');
    expect(result.experience[0].technologies).toEqual(['Python']);
  });

  it('extracts course items with name and date', () => {
    const result = normalizePortfolioData(BUNDLE.courses);
    expect(result.courses).toHaveLength(2);
    expect(result.courses[0].date).toBe('2024-11');
    expect(result.courses[0].type).toBe('taller');
  });

  it('ignores course-shaped objects whose date is not YYYY-MM', () => {
    const bundle = `{name:"Icono",emoji:"x",color:"#000",date:"siempre",type:"icon"}`;
    expect(normalizePortfolioData(bundle).courses).toHaveLength(0);
  });

  it('extracts achievements with a description longer than 30 chars', () => {
    const result = normalizePortfolioData(BUNDLE.achievements);
    expect(result.achievements).toHaveLength(1);
    expect(result.achievements[0].title).toBe('Mención de Honor en Innovación');
  });

  it('skips short title/description pairs, which are UI labels rather than awards', () => {
    const bundle = `{title:"Cerrar",description:"Cierra el panel"}`;
    expect(normalizePortfolioData(bundle).achievements).toHaveLength(0);
  });

  it('extracts skills arrays', () => {
    const result = normalizePortfolioData(BUNDLE.skills);
    expect(result.skills.languages).toContain('Python');
    expect(result.skills.frontend).toContain('React');
    expect(result.skills.ai).toContain('LLMs');
  });

  it('returns empty structures for a bundle it cannot parse, rather than throwing', () => {
    const result = normalizePortfolioData('console.log("nothing useful here")');
    expect(result.education).toEqual([]);
    expect(result.courses).toEqual([]);
    expect(result.personal).toEqual({ name: '', title: '', location: '' });
  });
});

describe('extractPersonal', () => {
  it('reads the single personal block when there is only one', () => {
    const result = normalizePortfolioData(BUNDLE.personal);
    expect(result.personal).toEqual({
      name: 'Ana Ejemplo',
      title: 'Ingeniera de Sistemas',
      location: 'Bogotá, Colombia',
    });
  });

  it('picks the block matching ownerNamePattern when the bundle has several', () => {
    const path = join(dir, 'cvlac.config.json');
    writeFileSync(path, JSON.stringify({ ownerNamePattern: 'Beto' }));
    process.env.CVLAC_CONFIG_PATH = path;
    const bundle =
      `{name:"Ana Ejemplo",title:"Ingeniera",location:"Bogotá"}` +
      `{name:"Beto Ficticio",title:"Científico de Datos",location:"Medellín"}`;
    expect(normalizePortfolioData(bundle).personal.name).toBe('Beto Ficticio');
  });

  it('falls back to the first block when ownerNamePattern matches nothing', () => {
    const path = join(dir, 'cvlac.config.json');
    writeFileSync(path, JSON.stringify({ ownerNamePattern: 'Nadie' }));
    process.env.CVLAC_CONFIG_PATH = path;
    const bundle = `{name:"Ana Ejemplo",title:"Ingeniera",location:"Bogotá"}`;
    expect(normalizePortfolioData(bundle).personal.name).toBe('Ana Ejemplo');
  });

  it('does not hardcode any particular owner name', () => {
    const bundle = `{name:"Zoraida Otra",title:"Docente",location:"Cali"}`;
    expect(normalizePortfolioData(bundle).personal.name).toBe('Zoraida Otra');
  });
});

describe('loadPortfolioExtra', () => {
  function writeExtra(contents: unknown | string): void {
    const path = join(dir, 'portfolio-extra.json');
    writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents));
    process.env.CVLAC_PORTFOLIO_EXTRA_PATH = path;
  }

  it('loads curated projects, software and events', () => {
    writeExtra({
      projects: [
        {
          title: 'Plataforma de Analítica',
          description: 'd',
          tipoProyecto: 'ID',
          startYear: '2023',
          startMonth: '1',
        },
      ],
      software: [{ name: 'Biblioteca', year: '2024' }],
      eventos: [{ name: 'Congreso', startDate: '10/05/2024' }],
    });
    const extra = loadPortfolioExtra();
    expect(extra.projects).toHaveLength(1);
    expect(extra.software[0].name).toBe('Biblioteca');
    expect(extra.eventos[0].startDate).toBe('10/05/2024');
  });

  it('returns empty categories when the file is absent', () => {
    process.env.CVLAC_PORTFOLIO_EXTRA_PATH = join(dir, 'no-existe.json');
    expect(loadPortfolioExtra()).toEqual({ projects: [], software: [], eventos: [] });
  });

  it('returns empty categories rather than partial data when an item is invalid', () => {
    writeExtra({ software: [{ name: 'Sin año' }] });
    expect(loadPortfolioExtra()).toEqual({ projects: [], software: [], eventos: [] });
  });

  it('returns empty categories for malformed JSON', () => {
    writeExtra('{ roto');
    expect(loadPortfolioExtra()).toEqual({ projects: [], software: [], eventos: [] });
  });

  it('feeds the loaded items straight into PortfolioData', () => {
    const extra = {
      projects: [],
      software: [{ name: 'Biblioteca', year: '2024' }],
      eventos: [],
    };
    const result = normalizePortfolioData(BUNDLE.education, extra);
    expect(result.software).toEqual(extra.software);
    expect(result.education).toHaveLength(2);
  });

  it('defaults to empty extras when the caller passes none', () => {
    const result = normalizePortfolioData(BUNDLE.education);
    expect(result.projects).toEqual([]);
    expect(result.software).toEqual([]);
    expect(result.eventos).toEqual([]);
  });
});
