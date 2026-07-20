import type {
  PortfolioData,
  CvLACData,
  DiffResult,
  DiffItem,
  SimilarDiffItem,
  SimilarCandidate,
  MatchType,
  CvLACSectionName,
} from './types.js';

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

/** Minimum core length before containment is trusted as "same item". */
export const SAME_CONTAINMENT_MIN = 8;
/** Cores this short are only ever "similar", never "same". */
export const SIMILAR_CONTAINMENT_MIN = 5;
/** Token overlap (Jaccard) at or above this makes two names "similar". */
export const SIMILAR_JACCARD_MIN = 0.5;

/** Words too common to carry meaning when measuring overlap. */
const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'con', 'para', 'a']);

function tokens(s: string): Set<string> {
  return new Set(
    normalize(s)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * How closely two free-text names match.
 *
 * 'exact'/'same' mean the same item; 'similar' means close enough that writing it
 * could duplicate an existing entry, so a human decides.
 */
export function classifyMatch(a: string, b: string): MatchType {
  if (!a || !b) return 'none';
  if (normalize(a) === normalize(b)) return 'exact';

  const ca = coreName(a);
  const cb = coreName(b);
  if (ca && ca === cb) return 'same';
  if (
    ca.length >= SAME_CONTAINMENT_MIN &&
    cb.length >= SAME_CONTAINMENT_MIN &&
    (ca.includes(cb) || cb.includes(ca))
  ) {
    return 'same';
  }

  if (
    ca.length >= SIMILAR_CONTAINMENT_MIN &&
    cb.length >= SIMILAR_CONTAINMENT_MIN &&
    (ca.includes(cb) || cb.includes(ca))
  ) {
    return 'similar';
  }
  if (jaccard(tokens(a), tokens(b)) >= SIMILAR_JACCARD_MIN) return 'similar';

  return 'none';
}

/** True when two names refer to the same item. */
export function nameMatches(a: string, b: string): boolean {
  const m = classifyMatch(a, b);
  return m === 'exact' || m === 'same';
}

/** First 4-digit year in a free-text period, or '' when there is none. */
function firstYear(s: string | undefined): string {
  return s?.match(/\d{4}/)?.[0] ?? '';
}

/**
 * Compares a portfolio item against every CvLAC entry in one section.
 *
 * `differs` decides whether a matched pair needs an update; it only runs on
 * 'exact'/'same' matches, and only when the CvLAC extractor exposes a comparable
 * field. Sections whose list view shows nothing but a name never yield updates.
 */
function classifySection<P, C>(
  section: CvLACSectionName,
  portfolioItems: P[],
  cvlacItems: C[],
  labelOf: (p: P) => string,
  matchNameOf: (p: P) => string,
  cvlacNameOf: (c: C) => string,
  isSame: (p: P, c: C) => boolean,
  differs: (p: P, c: C) => boolean,
  out: { missing: DiffItem[]; toUpdate: DiffItem[]; similar: SimilarDiffItem[]; upToDate: DiffItem[] }
): void {
  for (const p of portfolioItems) {
    const base = { section, label: labelOf(p), data: p } as const;

    const sameEntry = cvlacItems.find((c) => isSame(p, c));
    if (sameEntry) {
      const item: DiffItem = {
        ...base,
        action: differs(p, sameEntry) ? 'update' : 'add',
        matchedLabel: cvlacNameOf(sameEntry),
      };
      if (differs(p, sameEntry)) {
        out.toUpdate.push({ ...item, action: 'update' });
      } else {
        out.upToDate.push({ ...item, action: 'add' });
      }
      continue;
    }

    const candidates: SimilarCandidate[] = cvlacItems
      .filter((c) => classifyMatch(matchNameOf(p), cvlacNameOf(c)) === 'similar')
      .map((c) => ({ label: cvlacNameOf(c), matchType: 'similar' as const }));

    if (candidates.length > 0) {
      out.similar.push({ ...base, action: 'add', candidates });
    } else {
      out.missing.push({ ...base, action: 'add' });
    }
  }
}

export function computeDiff(portfolio: PortfolioData, cvlac: CvLACData): DiffResult {
  const out = {
    missing: [] as DiffItem[],
    toUpdate: [] as DiffItem[],
    similar: [] as SimilarDiffItem[],
    upToDate: [] as DiffItem[],
  };

  // ── Formación académica ──────────────────────────────────────────────────
  // The list view exposes the start year, so a year mismatch is a real update.
  classifySection(
    'formacion',
    portfolio.education,
    cvlac.formacion,
    (e) => `${e.degree} — ${e.institution}`,
    (e) => e.degree,
    (c) => c.degree,
    (e, c) => nameMatches(c.institution, e.institution) && nameMatches(c.degree, e.degree),
    (e, c) => {
      const a = firstYear(e.period);
      const b = firstYear(c.period);
      return Boolean(a && b && a !== b);
    },
    out
  );

  // ── Experiencia profesional ──────────────────────────────────────────────
  // Intentionally excluded from the diff (verified live, see docs/cvlac-findings.md):
  // CvLAC company names differ heavily from the portfolio (e.g. "MO TECNOLOGIAS COLOMBIA
  // SAS" vs "Mo Technologies (Mastercard)") so name-matching yields false "missing", and
  // the role/cargo is not exposed in the list view. Experiencia is managed manually.

  // ── Cursos de corta duración ─────────────────────────────────────────────
  classifySection(
    'cursos',
    portfolio.courses,
    cvlac.cursos,
    (c) => `${c.name} (${c.date})`,
    (c) => c.name,
    (c) => c.name,
    (p, c) => nameMatches(c.name, p.name),
    (p, c) => {
      const a = firstYear(p.date);
      const b = firstYear(c.date);
      return Boolean(a && b && a !== b);
    },
    out
  );

  // ── Reconocimientos ──────────────────────────────────────────────────────
  classifySection(
    'reconocimientos',
    portfolio.achievements,
    cvlac.reconocimientos,
    (a) => a.title,
    (a) => a.title,
    (c) => c.title,
    (p, c) => nameMatches(c.title, p.title),
    (p, c) => {
      const a = firstYear(p.year);
      const b = firstYear(c.year);
      return Boolean(a && b && a !== b);
    },
    out
  );

  // ── Eventos científicos ──────────────────────────────────────────────────
  // The list view carries only the name, so these can be added but never updated.
  classifySection(
    'eventos',
    portfolio.eventos,
    cvlac.eventos,
    (e) => e.name,
    (e) => e.name,
    (c) => c.name,
    (p, c) => nameMatches(c.name, p.name),
    () => false,
    out
  );

  // ── Software ─────────────────────────────────────────────────────────────
  classifySection(
    'software',
    portfolio.software,
    cvlac.software,
    (s) => s.name,
    (s) => s.name,
    (c) => c.name,
    (p, c) => nameMatches(c.name, p.name),
    () => false,
    out
  );

  // ── Proyectos ────────────────────────────────────────────────────────────
  classifySection(
    'proyectos',
    portfolio.projects,
    cvlac.proyectos,
    (p) => p.title,
    (p) => p.title,
    (c) => c.title,
    (p, c) => nameMatches(c.title, p.title),
    () => false,
    out
  );

  return out;
}
