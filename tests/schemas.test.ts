import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  SECTION_SCHEMAS,
  portfolioExtraSchema,
  formatIssues,
  achievementSchema,
  courseSchema,
  eventoSchema,
  projectSchema,
  softwareSchema,
} from '../src/schemas.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('SECTION_SCHEMAS', () => {
  it('covers every section the server accepts', () => {
    expect(Object.keys(SECTION_SCHEMAS).sort()).toEqual([
      'cursos',
      'eventos',
      'experiencia',
      'formacion',
      'proyectos',
      'reconocimientos',
      'software',
    ]);
  });

  it('rejects an item missing its required name', () => {
    const result = SECTION_SCHEMAS.reconocimientos.safeParse({ year: '2024' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty name, which would create a blank CvLAC entry', () => {
    expect(SECTION_SCHEMAS.cursos.safeParse({ name: '', date: '2024' }).success).toBe(false);
  });
});

describe('courseSchema', () => {
  it('accepts YYYY and YYYY-MM dates', () => {
    expect(courseSchema.safeParse({ name: 'Curso', date: '2024' }).success).toBe(true);
    expect(courseSchema.safeParse({ name: 'Curso', date: '2024-05' }).success).toBe(true);
  });

  it('rejects a free-text date', () => {
    const result = courseSchema.safeParse({ name: 'Curso', date: 'mayo de 2024' });
    expect(result.success).toBe(false);
    if (!result.success) expect(formatIssues(result.error)).toContain('date');
  });

  it('accepts the CvLAC-only optional fields', () => {
    const result = courseSchema.safeParse({
      name: 'Curso',
      date: '2024-05',
      participacion: 'D',
      duracionHoras: 8,
      idioma: 'ES',
      pais: 'CO',
      codMunicipio: '11001',
    });
    expect(result.success).toBe(true);
  });
});

describe('achievementSchema', () => {
  it('accepts an award without a year, since the filler warns instead of guessing', () => {
    expect(achievementSchema.safeParse({ title: 'Mención' }).success).toBe(true);
  });

  it('rejects a malformed year', () => {
    expect(achievementSchema.safeParse({ title: 'Mención', year: '24' }).success).toBe(false);
  });

  it('rejects an ámbito outside the CvLAC codes', () => {
    expect(achievementSchema.safeParse({ title: 'Mención', ambito: 'X' }).success).toBe(false);
  });
});

describe('eventoSchema', () => {
  it('requires DD/MM/YYYY dates, which is what the CvLAC picker stores', () => {
    expect(eventoSchema.safeParse({ name: 'Congreso', startDate: '10/05/2024' }).success).toBe(true);
    expect(eventoSchema.safeParse({ name: 'Congreso', startDate: '2024-05-10' }).success).toBe(false);
  });
});

describe('projectSchema', () => {
  it('rejects a tipoProyecto CvLAC does not offer', () => {
    const result = projectSchema.safeParse({
      title: 'P',
      description: 'd',
      tipoProyecto: 'ZZ',
      startYear: '2024',
      startMonth: '1',
    });
    expect(result.success).toBe(false);
  });

  it('accepts the funding source codes the form actually uses (I/E)', () => {
    const base = {
      title: 'P',
      description: 'd',
      tipoProyecto: 'ID' as const,
      startYear: '2024',
      startMonth: '1',
    };
    expect(projectSchema.safeParse({ ...base, fuenteFinanciacion: 'I' }).success).toBe(true);
    expect(projectSchema.safeParse({ ...base, fuenteFinanciacion: 'IN' }).success).toBe(false);
  });
});

describe('softwareSchema', () => {
  it('accepts per-textarea technical descriptions', () => {
    const result = softwareSchema.safeParse({
      name: 'App',
      year: '2024',
      descripcionTecnica: { analisis: 'a', desarrollo: 'b' },
    });
    expect(result.success).toBe(true);
  });
});

describe('portfolioExtraSchema', () => {
  it('validates the shipped example file', () => {
    const raw = JSON.parse(readFileSync(join(ROOT, 'data', 'portfolio-extra.example.json'), 'utf-8'));
    expect(portfolioExtraSchema.safeParse(raw).success).toBe(true);
  });

  it('defaults every category to an empty array', () => {
    const parsed = portfolioExtraSchema.parse({});
    expect(parsed).toEqual({ projects: [], software: [], eventos: [] });
  });

  it('rejects the whole file when one item is malformed', () => {
    const result = portfolioExtraSchema.safeParse({ software: [{ name: 'App' }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(formatIssues(result.error)).toContain('year');
  });
});

describe('formatIssues', () => {
  it('names the offending path so the message points at a field', () => {
    const result = courseSchema.safeParse({ name: 'C', date: 'ayer' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatIssues(result.error)).toMatch(/^date: /);
    }
  });
});
