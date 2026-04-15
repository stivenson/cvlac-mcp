import type { PortfolioData, CvLACData, DiffResult, DiffItem } from './types.js';

/** Normalize a string for fuzzy matching: lowercase, remove diacritics, collapse spaces */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeDiff(portfolio: PortfolioData, cvlac: CvLACData): DiffResult {
  const missing: DiffItem[] = [];
  const upToDate: DiffItem[] = [];

  // ── Formación académica ──────────────────────────────────────────────────
  for (const edu of portfolio.education) {
    const key = normalize(edu.institution) + '|' + normalize(edu.degree);
    const found = cvlac.formacion.some(
      (c) => normalize(c.institution) + '|' + normalize(c.degree) === key
    );
    const item: DiffItem = {
      section: 'formacion',
      action: 'add',
      label: `${edu.degree} — ${edu.institution}`,
      data: edu,
    };
    (found ? upToDate : missing).push(item);
  }

  // ── Experiencia profesional ──────────────────────────────────────────────
  for (const exp of portfolio.experience) {
    const key = normalize(exp.company) + '|' + normalize(exp.role);
    const found = cvlac.experiencia.some(
      (c) => normalize(c.company) + '|' + normalize(c.role) === key
    );
    const item: DiffItem = {
      section: 'experiencia',
      action: 'add',
      label: `${exp.role} @ ${exp.company}`,
      data: exp,
    };
    (found ? upToDate : missing).push(item);
  }

  // ── Formación complementaria (cursos) ────────────────────────────────────
  for (const course of portfolio.courses) {
    const key = normalize(course.name);
    const found = cvlac.cursos.some((c) => normalize(c.name) === key);
    const item: DiffItem = {
      section: 'cursos',
      action: 'add',
      label: `${course.name} (${course.date})`,
      data: course,
    };
    (found ? upToDate : missing).push(item);
  }

  // ── Reconocimientos ──────────────────────────────────────────────────────
  for (const ach of portfolio.achievements) {
    const key = normalize(ach.title);
    const found = cvlac.reconocimientos.some((c) => normalize(c.title) === key);
    const item: DiffItem = {
      section: 'reconocimientos',
      action: 'add',
      label: ach.title,
      data: ach,
    };
    (found ? upToDate : missing).push(item);
  }

  return { missing, upToDate };
}
