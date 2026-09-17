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

/**
 * What to send to a CvLAC search endpoint.
 *
 * Those endpoints answer in latin1 and compare against the bytes they receive,
 * so an accent encoded as UTF-8 arrives mangled — "Cúcuta" reaches them as
 * "CÃºcuta" and matches nothing, which silently left a formación and an evento
 * with no municipality. The accents still count when picking among the results;
 * they just cannot be asked for. Ñ survives because latin1 has it.
 */
export function catalogueQuery(name: string): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, (_m, offset: number, whole: string) =>
      whole[offset - 1] === 'n' || whole[offset - 1] === 'N' ? _m : ''
    )
    .normalize('NFC');
}

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
export function bestMatch<T>(items: T[], wanted: string, labelOf: (item: T) => string): T | null {
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

/**
 * Whether the project's amount field applies.
 *
 * Choosing "Solidario" hides only `nro_valor` — and the financing-source radios
 * beside it. The administrative act and its date stay on screen and stay
 * required, so they are filled either way. Note CvLAC also refuses an amount
 * below 10.000.000.
 */
export function projectValueApplies(tipoFinanciacion: string | undefined): boolean {
  return tipoFinanciacion === 'FI';
}

/**
 * A date in the only shape CvLAC's forms accept: `yyyy-mm-dd`.
 *
 * Its datepicker is configured with dateFormat "yy-mm-dd", which is jQuery UI
 * for a four-digit year. A day-first date reaches the server as an invalid
 * format and takes the whole submit down with it.
 */
export function cvlacDateString(input: string | undefined | null): string | null {
  const text = (input ?? '').trim();
  if (!text) return null;

  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const dayFirst = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text);
  if (dayFirst) return `${dayFirst[3]}-${dayFirst[2].padStart(2, '0')}-${dayFirst[1].padStart(2, '0')}`;

  return null;
}

export interface NamedRow {
  id: string;
  name: string;
}

export interface MunicipioOption extends NamedRow {
  /** The 10-character prefix the form stores next to the code. */
  codRh: string;
}

/** Picks a row of the location cascade by name, ignoring case and accents. */
export function pickByName<T extends { name: string }>(rows: T[], wanted: string): T | null {
  return bestMatch(rows, wanted, (r) => r.name);
}

const tag = (xml: string, name: string): string[] =>
  Array.from(xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'gi'))).map((m) => m[1]);

const inner = (chunk: string, name: string): string => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i').exec(chunk);
  return m ? m[1].trim() : '';
};

/** `getDepartamentosAsXML`: the sigla each department answers to (NO, NA, AN…). */
export function parseDepartamentosXml(xml: string): NamedRow[] {
  return tag(xml, 'departamento')
    .map((chunk) => ({ id: inner(chunk, 'id'), name: inner(chunk, 'name') }))
    .filter((d) => d.id && d.name);
}

/**
 * `getMunicipiosAsXML`: the only place the code `cod_municipio` stores comes from.
 *
 * CvLAC numbers municipalities three different ways — DANE, the id its JSON
 * search returns, and this one — and the form understands only this. Cúcuta is
 * 54001, 827 and 991 respectively; the first two got written as Sketty and Neiva.
 */
export function parseMunicipiosXml(xml: string): MunicipioOption[] {
  return tag(xml, 'municipio')
    .map((chunk) => ({
      id: inner(chunk, 'id'),
      name: inner(chunk, 'name'),
      codRh: inner(chunk, 'cod_rh'),
    }))
    .filter((m) => m.id && m.name && !/^no informado$/i.test(m.name));
}

/** The text the picker leaves in the readonly field: country, department, town. */
export function municipioDisplayName(
  pais: string,
  departamento: string | null,
  municipio: string
): string {
  return [pais, departamento, municipio].filter(Boolean).join(' - ');
}

/**
 * The country code a CvLAC select actually carries.
 *
 * Its options are three letters (COL, ARG), while `cvlac.config.json` and the
 * portfolio use the two-letter ISO code. Asking for "CO" matched no option, so
 * the select kept whatever it had and the call waited out its timeout.
 *
 * Only the mapping this server can be sure of is applied; anything else is
 * passed through, so a wrong guess never reaches a record.
 */
const COUNTRY_THREE_LETTER: Record<string, string> = { CO: 'COL' };

export function countryOption(code: string | undefined): string | undefined {
  if (!code) return code;
  const upper = code.toUpperCase();
  return COUNTRY_THREE_LETTER[upper] ?? upper;
}

export type CatalogueResolution<T> =
  | { kind: 'exact'; item: T }
  | { kind: 'ambiguous'; options: T[] }
  | { kind: 'none' };

/**
 * Which row of a CvLAC picker a name means — or that a person has to say.
 *
 * Searching "UNIVERSIDAD SIMON BOLIVAR" returns 193 institutions: the one in
 * Venezuela, the Andina, several sedes, a teachers' union and an employees'
 * fund. Taking the first partial match attached the record to whichever CvLAC
 * listed first, silently and with no undo.
 *
 * An exact name still resolves on its own — that is the ordinary case, and
 * asking about it would be noise. Anything less decides nothing.
 */
export function resolveChoice<T>(
  items: T[],
  wanted: string,
  labelOf: (item: T) => string,
  limit = 10
): CatalogueResolution<T> {
  const target = norm(wanted);
  if (!target || items.length === 0) return { kind: 'none' };

  const exact = items.filter((item) => norm(labelOf(item)) === target);
  if (exact.length === 1) return { kind: 'exact', item: exact[0] };
  if (exact.length > 1) return { kind: 'ambiguous', options: exact.slice(0, limit) };

  const partial = items.filter((item) => {
    const label = norm(labelOf(item));
    return label.includes(target) || target.includes(label);
  });
  if (partial.length === 1) return { kind: 'exact', item: partial[0] };
  if (partial.length > 1) return { kind: 'ambiguous', options: partial.slice(0, limit) };

  return { kind: 'none' };
}
