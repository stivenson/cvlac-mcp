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

/** Normalized "core" name: drops parenthetical qualifiers like "(Platzi)" and trailing
 *  " - Aprobado abril 2021" style suffixes so the same item matches across both sources. */
function coreName(s: string): string {
  return normalize(
    s
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\s[-–—]\s.*$/, ' ')
  );
}

/** True when two free-text names refer to the same item (accent/case/suffix-insensitive). */
export function nameMatches(a: string, b: string): boolean {
  if (normalize(a) === normalize(b)) return true;
  const ca = coreName(a);
  const cb = coreName(b);
  if (ca && ca === cb) return true;
  // Containment only when both cores are long enough to avoid false positives.
  if (ca.length >= 8 && cb.length >= 8 && (ca.includes(cb) || cb.includes(ca))) return true;
  return false;
}

export function computeDiff(portfolio: PortfolioData, cvlac: CvLACData): DiffResult {
  const missing: DiffItem[] = [];
  const upToDate: DiffItem[] = [];

  // ── Formación académica ──────────────────────────────────────────────────
  for (const edu of portfolio.education) {
    const found = cvlac.formacion.some(
      (c) => nameMatches(c.institution, edu.institution) && nameMatches(c.degree, edu.degree)
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
  // Intentionally excluded from the diff (verified live, see docs/cvlac-findings.md):
  // CvLAC company names differ heavily from the portfolio (e.g. "MO TECNOLOGIAS COLOMBIA
  // SAS" vs "Mo Technologies (Mastercard)") so name-matching yields false "missing", and
  // the role/cargo is not exposed in the list view. Experiencia is managed manually.

  // ── Formación complementaria (cursos) ────────────────────────────────────
  for (const course of portfolio.courses) {
    const found = cvlac.cursos.some((c) => nameMatches(c.name, course.name));
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
    const found = cvlac.reconocimientos.some((c) => nameMatches(c.title, ach.title));
    const item: DiffItem = {
      section: 'reconocimientos',
      action: 'add',
      label: ach.title,
      data: ach,
    };
    (found ? upToDate : missing).push(item);
  }

  // ── Eventos científicos ───────────────────────────────────────────────────
  for (const ev of portfolio.eventos) {
    const found = cvlac.eventos.some((c) => nameMatches(c.name, ev.name));
    const item: DiffItem = {
      section: 'eventos',
      action: 'add',
      label: ev.name,
      data: ev,
    };
    (found ? upToDate : missing).push(item);
  }

  // ── Software ─────────────────────────────────────────────────────────────
  for (const sw of portfolio.software) {
    const found = cvlac.software.some((c) => nameMatches(c.name, sw.name));
    const item: DiffItem = {
      section: 'software',
      action: 'add',
      label: sw.name,
      data: sw,
    };
    (found ? upToDate : missing).push(item);
  }

  // ── Proyectos ────────────────────────────────────────────────────────────
  for (const proj of portfolio.projects) {
    const found = cvlac.proyectos.some((c) => nameMatches(c.title, proj.title));
    const item: DiffItem = {
      section: 'proyectos',
      action: 'add',
      label: proj.title,
      data: proj,
    };
    (found ? upToDate : missing).push(item);
  }

  return { missing, upToDate };
}
