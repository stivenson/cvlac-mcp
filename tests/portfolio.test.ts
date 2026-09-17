import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadPortfolioExtra } from '../src/extractors/portfolio.js';
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


});
