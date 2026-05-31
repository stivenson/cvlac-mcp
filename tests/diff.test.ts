import { describe, it, expect } from 'vitest';
import { computeDiff, nameMatches } from '../src/diff.js';
import type { PortfolioData, CvLACData } from '../src/types.js';

const portfolioData: PortfolioData = {
  personal: { name: 'Stivenson Rincón Mora', title: 'Engineer', location: 'Cúcuta' },
  education: [
    {
      institution: 'Universidad de los Andes',
      degree: 'Maestría en Inteligencia Artificial',
      period: 'Feb 2024 - Actualidad',
    },
    {
      institution: 'Universidad Simón Bolívar',
      degree: 'Ingeniería de Sistemas',
      period: 'Ago 2009 - Jul 2014',
    },
  ],
  experience: [
    {
      company: 'Mo Technologies (Mastercard - Start Path)',
      role: 'Full Stack - Senior Developer',
      period: 'Mar 2021 - Jul 2025',
      modality: 'semi-presencial',
      description: [],
    },
  ],
  courses: [
    { name: 'Taller Planeación y Optimización IA (USB)', date: '2025-11', type: 'taller' },
    { name: 'Curso Práctico de Cloud Computing con AWS (Platzi)', date: '2021-04', type: 'curso' },
  ],
  achievements: [
    {
      title: 'Exaltación Académica',
      description: 'Ing. de Sistemas con mención por trabajo social',
    },
  ],
  projects: [],
  software: [],
  eventos: [],
  skills: { languages: [], frontend: [], ai: [], cloud: [], devops: [], databases: [] },
};

/** Empty CvLAC sections that don't participate in a given test case */
const emptyCvlacExtras = { proyectos: [], software: [], eventos: [] };

describe('computeDiff', () => {
  it('returns all portfolio items as missing when CvLAC is empty', () => {
    const cvlac: CvLACData = {
      formacion: [],
      experiencia: [],
      cursos: [],
      reconocimientos: [],
      ...emptyCvlacExtras,
    };
    const result = computeDiff(portfolioData, cvlac);
    expect(result.missing.filter((d) => d.section === 'formacion')).toHaveLength(2);
    // experiencia is intentionally excluded from the diff (managed manually in CvLAC)
    expect(result.missing.filter((d) => d.section === 'experiencia')).toHaveLength(0);
    expect(result.missing.filter((d) => d.section === 'cursos')).toHaveLength(2);
    expect(result.missing.filter((d) => d.section === 'reconocimientos')).toHaveLength(1);
    expect(result.upToDate).toHaveLength(0);
  });

  it('marks item as upToDate when it already exists in CvLAC', () => {
    const cvlac: CvLACData = {
      formacion: [
        { institution: 'universidad simon bolivar', degree: 'ingenieria de sistemas' },
      ],
      experiencia: [],
      cursos: [],
      reconocimientos: [],
      ...emptyCvlacExtras,
    };
    const result = computeDiff(portfolioData, cvlac);
    const upToDateFormacion = result.upToDate.filter((d) => d.section === 'formacion');
    expect(upToDateFormacion).toHaveLength(1);
    expect(upToDateFormacion[0].label).toContain('Simón Bolívar');
  });

  it('treats accents and case as equal during matching', () => {
    const cvlac: CvLACData = {
      formacion: [],
      experiencia: [
        {
          company: 'mo technologies (mastercard - start path)',
          role: 'full stack - senior developer',
        },
      ],
      cursos: [],
      reconocimientos: [],
      ...emptyCvlacExtras,
    };
    const result = computeDiff(portfolioData, cvlac);
    const missingExp = result.missing.filter((d) => d.section === 'experiencia');
    expect(missingExp).toHaveLength(0);
  });

  it('marks course as missing when not in CvLAC', () => {
    const cvlac: CvLACData = {
      formacion: [],
      experiencia: [],
      cursos: [{ name: 'Taller Planeación y Optimización IA (USB)' }],
      reconocimientos: [],
      ...emptyCvlacExtras,
    };
    const result = computeDiff(portfolioData, cvlac);
    const missingCursos = result.missing.filter((d) => d.section === 'cursos');
    expect(missingCursos).toHaveLength(1);
    expect(missingCursos[0].label).toContain('AWS');
  });
});

describe('nameMatches', () => {
  it('ignores accents and case', () => {
    expect(nameMatches('Ingeniería de Sistemas', 'INGENIERIA DE SISTEMAS')).toBe(true);
  });

  it('matches across parenthetical and trailing suffixes', () => {
    expect(
      nameMatches(
        'Curso Práctico de Cloud Computing con AWS',
        'Curso Práctico de Cloud Computing con AWS (Platzi) - Aprobado abril 2021'
      )
    ).toBe(true);
  });

  it('does not conflate two different AWS courses', () => {
    expect(
      nameMatches(
        'Curso Práctico de AWS Cloud (Platzi)',
        'Curso Práctico de Cloud Computing con AWS (Platzi)'
      )
    ).toBe(false);
  });
});
