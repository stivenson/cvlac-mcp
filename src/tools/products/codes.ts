/** Human labels to the exact values posted by CvLAC's radios and selects. */

const norm = (s: string): string =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();

type Rules = Array<[RegExp, string]>;

function codeFrom(rules: Rules, text: string): string | null {
  const raw = (text ?? '').trim();
  if (!raw) return null;
  const codes = new Set(rules.map(([, code]) => code));
  if (codes.has(raw)) return raw;
  if (codes.has(raw.toUpperCase())) return raw.toUpperCase();
  const value = norm(raw);
  for (const [rule, code] of rules) if (rule.test(value)) return code;
  return null;
}

export const articuloTipo = (text: string): string | null =>
  codeFrom([
    [/caso clinico|case report/, '114'],
    [/revision|review/, '113'],
    [/corto|short/, '112'],
    [/completo|original|full|research article|investigacion/, '111'],
  ], text);

export const medioPublicacion = (text: string): string | null =>
  codeFrom([
    [/papel|impreso|print/, 'I'],
    [/electronico|internet|web|online|digital/, 'H'],
  ], text);

export const tesisTipo = (text: string): string | null =>
  codeFrom([
    [/iniciacion|semillero/, '65'],
    [/doctor|phd/, '61'],
    [/maestr|magist|master|especialidad clinica/, '62'],
    [/monografia|especializacion|perfeccionamiento/, '63'],
    [/pregrado|grado/, '64'],
    [/otro|tutoria/, '66'],
  ], text);

export const tesisRol = (text: string): string | null =>
  codeFrom([
    [/co ?director|co ?tutor/, 'C'],
    [/asesor/, 'A'],
    [/director|tutor|principal/, 'O'],
  ], text);

export const tesisValoracion = (text: string): string | null =>
  codeFrom([
    [/laureada/, '7'],
    [/meritoria/, '5'],
    [/aprobad/, '6'],
  ], text);

export const juradoNivel = (text: string): string | null =>
  codeFrom([
    [/especialidad medica/, 'A16'],
    [/especializacion/, 'A14'],
    [/maestr|magist|master/, 'A11'],
    [/doctor|phd/, 'A12'],
    [/pregrado/, 'A15'],
  ], text);

export const juradoTrabajo = (text: string): string | null =>
  codeFrom([
    [/examen|calificacion/, 'ED'],
    [/proyecto/, 'PG'],
    [/trabajo|tesis/, 'TG'],
  ], text);

export const libroPublicacion = (text: string): string | null =>
  codeFrom([
    [/book citation|bci|indexado/, 'BC'],
    [/internacional/, 'EI'],
    [/nacional/, 'ED'],
  ], text);

export const disponibilidad = (text: string): string | null =>
  codeFrom([
    [/no restringid|public|abiert/, 'No restringido'],
    [/restringid|privad|confidencial/, 'Restringido'],
  ], text);

export const consultoriaTipo = (text: string): string | null =>
  codeFrom([
    [/idi|proyectos/, '241'],
    [/transferencia/, '242'],
    [/comercializacion/, '243'],
    [/desarrollo de productos/, '244'],
    [/competitividad/, '246'],
    [/sistemas de analisis/, '247'],
    [/artes|arquitectura|diseno/, '248'],
    [/otro/, '249'],
  ], text);

export const prototipoTipo = (text: string): string | null =>
  codeFrom([[/industrial/, '281'], [/servicio/, '282']], text);

export const productoTecnologicoTipo = (text: string): string | null =>
  codeFrom([
    [/gen clonado/, '225'],
    [/base de datos/, '226'],
    [/coleccion biologica/, '227'],
    [/otro/, '229'],
  ], text);
