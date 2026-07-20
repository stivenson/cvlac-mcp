import { describe, it, expect } from 'vitest';
import { computeDiff, nameMatches, classifyMatch } from '../src/diff.js';
import type { PortfolioData, CvLACData } from '../src/types.js';

// Fictional data — the repo is public, so no real CV records live in tests.
const portfolioData: PortfolioData = {
  personal: { name: 'Ana Ejemplo', title: 'Engineer', location: 'Bogotá' },
  education: [
    {
      institution: 'Universidad Nacional de Colombia',
      degree: 'Maestría en Ciencia de Datos',
      period: 'Feb 2018 - Dic 2020',
    },
    {
      institution: 'Universidad de Antioquia',
      degree: 'Ingeniería de Sistemas',
      period: 'Ago 2010 - Jul 2015',
    },
  ],
  experience: [
    {
      company: 'Empresa Ejemplo (Grupo Ficticio)',
      role: 'Full Stack - Senior Developer',
      period: 'Mar 2021 - Jul 2025',
      modality: 'semi-presencial',
      description: [],
    },
  ],
  courses: [
    { name: 'Taller de Introducción a la Programación (UNAL)', date: '2024-11', type: 'taller' },
    { name: 'Curso Práctico de Cómputo en la Nube (Academia)', date: '2022-04', type: 'curso' },
  ],
  achievements: [{ title: 'Mención de Honor en Innovación', description: 'Por el proyecto X' }],
  projects: [],
  software: [],
  eventos: [],
  skills: { languages: [], frontend: [], ai: [], cloud: [], devops: [], databases: [] },
};

const emptyCvlac: CvLACData = {
  formacion: [],
  experiencia: [],
  cursos: [],
  reconocimientos: [],
  proyectos: [],
  software: [],
  eventos: [],
};

function cvlac(overrides: Partial<CvLACData> = {}): CvLACData {
  return { ...emptyCvlac, ...overrides };
}

describe('classifyMatch', () => {
  it('calls identical names exact, ignoring case and accents', () => {
    expect(classifyMatch('Ingeniería de Sistemas', 'INGENIERIA DE SISTEMAS')).toBe('exact');
  });

  it('calls the same item "same" across parenthetical and trailing suffixes', () => {
    expect(
      classifyMatch(
        'Curso Práctico de Cómputo en la Nube',
        'Curso Práctico de Cómputo en la Nube (Academia) - Aprobado abril 2022'
      )
    ).toBe('same');
  });

  it('flags near-duplicates as similar rather than same', () => {
    expect(classifyMatch('Taller de Programación Básica', 'Taller de Programación Avanzada')).toBe(
      'similar'
    );
  });

  it('returns none for unrelated names', () => {
    expect(classifyMatch('Ingeniería de Sistemas', 'Mención de Honor en Innovación')).toBe('none');
  });

  it('returns none when either name is empty', () => {
    expect(classifyMatch('', 'Algo')).toBe('none');
    expect(classifyMatch('Algo', '')).toBe('none');
  });

  it('does not treat short shared words as a match', () => {
    expect(classifyMatch('Curso de Java', 'Taller de Rust')).toBe('none');
  });
});

describe('nameMatches', () => {
  it('accepts exact and same, rejects similar', () => {
    expect(nameMatches('Ingeniería de Sistemas', 'INGENIERIA DE SISTEMAS')).toBe(true);
    expect(
      nameMatches(
        'Curso Práctico de Cómputo en la Nube',
        'Curso Práctico de Cómputo en la Nube (Academia)'
      )
    ).toBe(true);
    expect(nameMatches('Taller de Programación Básica', 'Taller de Programación Avanzada')).toBe(
      false
    );
  });
});

describe('computeDiff', () => {
  it('reports every portfolio item as missing when CvLAC is empty', () => {
    const result = computeDiff(portfolioData, emptyCvlac);
    expect(result.missing.filter((d) => d.section === 'formacion')).toHaveLength(2);
    expect(result.missing.filter((d) => d.section === 'cursos')).toHaveLength(2);
    expect(result.missing.filter((d) => d.section === 'reconocimientos')).toHaveLength(1);
    expect(result.upToDate).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.similar).toHaveLength(0);
  });

  it('never reports experiencia, which is managed manually', () => {
    const result = computeDiff(portfolioData, emptyCvlac);
    const all = [...result.missing, ...result.toUpdate, ...result.similar, ...result.upToDate];
    expect(all.filter((d) => d.section === 'experiencia')).toHaveLength(0);
  });

  it('marks an item already in CvLAC as upToDate', () => {
    const result = computeDiff(
      portfolioData,
      cvlac({
        formacion: [
          { institution: 'universidad de antioquia', degree: 'ingenieria de sistemas', period: '2010-2015' },
        ],
      })
    );
    const formacion = result.upToDate.filter((d) => d.section === 'formacion');
    expect(formacion).toHaveLength(1);
    expect(formacion[0].label).toContain('Antioquia');
    expect(formacion[0].matchedLabel).toBe('ingenieria de sistemas');
  });

  it('moves a matched item to toUpdate when the year differs', () => {
    const result = computeDiff(
      portfolioData,
      cvlac({
        formacion: [
          { institution: 'Universidad de Antioquia', degree: 'Ingeniería de Sistemas', period: '2011-2016' },
        ],
      })
    );
    expect(result.toUpdate.filter((d) => d.section === 'formacion')).toHaveLength(1);
    expect(result.toUpdate[0].action).toBe('update');
    expect(result.upToDate.filter((d) => d.section === 'formacion')).toHaveLength(0);
  });

  it('does not ask for an update when CvLAC exposes no comparable year', () => {
    const result = computeDiff(
      portfolioData,
      cvlac({
        formacion: [
          { institution: 'Universidad de Antioquia', degree: 'Ingeniería de Sistemas', period: '-' },
        ],
      })
    );
    expect(result.toUpdate).toHaveLength(0);
    expect(result.upToDate.filter((d) => d.section === 'formacion')).toHaveLength(1);
  });

  it('detects a course whose year changed', () => {
    const result = computeDiff(
      portfolioData,
      cvlac({ cursos: [{ name: 'Taller de Introducción a la Programación', date: '2023' }] })
    );
    const updates = result.toUpdate.filter((d) => d.section === 'cursos');
    expect(updates).toHaveLength(1);
    expect(updates[0].label).toContain('2024-11');
  });

  it('routes a near-duplicate to similar with its candidates instead of missing', () => {
    const result = computeDiff(
      portfolioData,
      cvlac({ reconocimientos: [{ title: 'Mención de Honor en Docencia', year: '2024' }] })
    );
    expect(result.missing.filter((d) => d.section === 'reconocimientos')).toHaveLength(0);
    const similar = result.similar.filter((d) => d.section === 'reconocimientos');
    expect(similar).toHaveLength(1);
    expect(similar[0].candidates).toEqual([
      { label: 'Mención de Honor en Docencia', matchType: 'similar' },
    ]);
  });

  it('lists every similar candidate, not just the first', () => {
    const result = computeDiff(
      portfolioData,
      cvlac({
        reconocimientos: [
          { title: 'Mención de Honor en Docencia', year: '2024' },
          { title: 'Mención de Honor en Extensión', year: '2023' },
        ],
      })
    );
    expect(result.similar[0].candidates).toHaveLength(2);
  });

  it('prefers an exact match over a similar one in the same section', () => {
    const result = computeDiff(
      portfolioData,
      cvlac({
        reconocimientos: [
          { title: 'Mención de Honor en Docencia', year: '2024' },
          { title: 'Mención de Honor en Innovación', year: '2024' },
        ],
      })
    );
    expect(result.similar).toHaveLength(0);
    expect(result.upToDate.filter((d) => d.section === 'reconocimientos')).toHaveLength(1);
  });

  it('only ever adds sections whose list view carries no comparable field', () => {
    const withExtras: PortfolioData = {
      ...portfolioData,
      software: [{ name: 'Biblioteca de Componentes', year: '2024' }],
      eventos: [{ name: 'Congreso Nacional de Ingeniería', startDate: '10/05/2024' }],
      projects: [
        {
          title: 'Plataforma de Analítica',
          description: 'x',
          tipoProyecto: 'ID',
          startYear: '2023',
          startMonth: '1',
        },
      ],
    };
    const result = computeDiff(
      withExtras,
      cvlac({
        software: [{ name: 'Biblioteca de Componentes' }],
        eventos: [{ name: 'Congreso Nacional de Ingeniería' }],
        proyectos: [{ title: 'Plataforma de Analítica' }],
      })
    );
    expect(result.toUpdate).toHaveLength(0);
    expect(result.upToDate.filter((d) => ['software', 'eventos', 'proyectos'].includes(d.section))).toHaveLength(3);
  });

  it('carries the portfolio item through as data so sync can apply it', () => {
    const result = computeDiff(portfolioData, emptyCvlac);
    const curso = result.missing.find((d) => d.section === 'cursos');
    expect(curso?.data).toEqual(portfolioData.courses[0]);
  });
});
