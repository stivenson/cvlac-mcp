/**
 * Resolving the codes CvLAC validates against its own catalogues.
 *
 * Several fields on a CvLAC form are readonly text next to a hidden code, filled
 * by a popup. The server reads the code and ignores the text, so writing the
 * text alone produces either a rejection ("Seleccione un programa académico") or
 * — worse — a saved record pointing at the wrong row: a municipality passed as
 * its DANE code once stored a formación in Sketty, Wales, because 54001 happens
 * to be a different municipality in CvLAC's own numbering.
 */

const norm = (s: string): string =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export interface CatalogueOption {
  /** What goes in the hidden field, exactly as the picker would set it. */
  value: string;
  label: string;
}

/**
 * The programmes `queryPrograma.do` offers, as `<option value="rh-code">Name`.
 *
 * Its markup is hand-written JSP: single-quoted attributes, the name on its own
 * indented line. Parsed with a regex on purpose — pulling in a DOM to read one
 * select would cost more than it explains.
 */
export function parseProgramaOptions(html: string): CatalogueOption[] {
  const out: CatalogueOption[] = [];
  for (const match of html.matchAll(/<option\s+value=['"]([^'"]*)['"]\s*>([\s\S]*?)<\/option>/gi)) {
    const value = match[1].trim();
    const label = match[2].replace(/\s+/g, ' ').trim();
    if (!value || !label) continue;
    out.push({ value, label });
  }
  return out;
}

/** Generic "find the row a human would have clicked", or null rather than a guess. */
function bestMatch<T>(items: T[], wanted: string, labelOf: (item: T) => string): T | null {
  const target = norm(wanted);
  if (!target) return null;

  const exact = items.find((item) => norm(labelOf(item)) === target);
  if (exact) return exact;

  const contains = items.find((item) => {
    const label = norm(labelOf(item));
    return label.includes(target) || target.includes(label);
  });
  return contains ?? null;
}

export function pickPrograma(options: CatalogueOption[], degree: string): CatalogueOption | null {
  return bestMatch(options, degree, (o) => o.label);
}

export interface MunicipioRow {
  id: number;
  txtNmeMunicipio: string;
}

export function pickMunicipio<T extends MunicipioRow>(rows: T[], name: string): T | null {
  return bestMatch(rows, name, (r) => r.txtNmeMunicipio);
}

/**
 * Whether the form will demand a programme for this level of study.
 *
 * Mirrors `cambiarNivelFormacion()` on the page: the field is hidden for the
 * school levels and for "no informado", and shown — and required — for the rest.
 */
export function needsProgramaAcademico(codNivelFormacion: string): boolean {
  return !['', 'A', 'B', 'C', 'Z'].includes(codNivelFormacion);
}
