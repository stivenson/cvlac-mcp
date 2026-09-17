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
  skills: {},
};

const emptyCvlac: CvLACData = {
  formacion: [],
  formacionComple: [],
  idiomas: [],
  lineas: [],
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

// Both cases came from the first diff run against the rewritten portfolio. Each
// was reported missing while CvLAC held it, and sync applies "missing" on its
// own — so each would have become a duplicate in the official record.
describe('computeDiff — items CvLAC holds under another section or wording', () => {
  // Only what each case is about: the shared fixture's courses and award would
  // show up as missing too and bury the one item under test.
  const only = (overrides: Partial<PortfolioData>): PortfolioData => ({
    ...portfolioData,
    education: [],
    courses: [],
    achievements: [],
    ...overrides,
  });

  // A diplomado is formación complementaria in CvLAC, not formación académica.
  // Looking only at formacion reported it missing.
  it('finds a diplomado that CvLAC keeps under formación complementaria', () => {
    const result = computeDiff(
      only({
        education: [
          {
            institution: 'Universidad Ejemplo',
            degree: 'Diplomado - Desarrollo de aplicaciones móviles',
            period: 'Febrero 2014 - Junio 2014',
          },
        ],
      }),
      cvlac({
        formacionComple: [
          {
            institution: 'UNIVERSIDAD EJEMPLO (SEDE NORTE)',
            degree: 'Diplomado en Desarrollo de aplicaciones moviles',
            period: '2014-2014',
          },
        ],
      })
    );
    expect(result.missing).toEqual([]);
    expect(result.upToDate).toHaveLength(1);
  });

  it('proposes a new diplomado for formación complementaria, not académica', () => {
    const result = computeDiff(
      only({
        education: [
          { institution: 'Universidad Ejemplo', degree: 'Diplomado en Ciencia de Datos', period: '2020 - 2020' },
        ],
      }),
      cvlac()
    );
    expect(result.missing.map((m) => m.section)).toEqual(['formacionComple']);
  });

  it('keeps a degree in formación académica', () => {
    const result = computeDiff(
      only({
        education: [{ institution: 'Universidad Ejemplo', degree: 'Ingeniería Civil', period: '2010 - 2015' }],
      }),
      cvlac()
    );
    expect(result.missing.map((m) => m.section)).toEqual(['formacion']);
  });

  // The portfolio names the award in two words and explains it in the
  // description; CvLAC's title is the explanation. The titles share one word,
  // so matching titles alone found nothing.
  it('flags an award worded differently as similar, never as missing', () => {
    const result = computeDiff(
      only({
        achievements: [
          {
            title: 'Exaltación Académica',
            description: 'Mención por trabajo social en Villaejemplo. Proyecto que unió técnica y propósito.',
          },
        ],
      }),
      cvlac({
        reconocimientos: [
          {
            title: 'Exaltación por su apoyo en la gestión del proyecto de estudio socioeconómico de Villaejemplo',
            year: '2012',
          },
        ],
      })
    );
    expect(result.missing).toEqual([]);
    expect(result.similar).toHaveLength(1);
    expect(result.similar[0].candidates[0].label).toContain('Villaejemplo');
  });

  // Sharing only the award type is not evidence: every second place is not the
  // same second place.
  it('does not tie two awards that share nothing but their kind', () => {
    const result = computeDiff(
      only({
        achievements: [{ title: 'Exaltación Académica', description: 'Por un trabajo en Bogotá.' }],
      }),
      cvlac({ reconocimientos: [{ title: 'Exaltación deportiva en natación', year: '2010' }] })
    );
    expect(result.missing).toHaveLength(1);
  });
});
