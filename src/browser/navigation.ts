import type { CvLACSectionName } from '../types.js';

export const BASE_URL = 'https://scienti.minciencias.gov.co';

/** Resolve a link from CvLAC and refuse cross-origin or non-HTTPS targets. */
export function toCvLacUrl(href: string): string {
  let url: URL;
  try {
    url = new URL(href, BASE_URL);
  } catch {
    throw new Error(`CvLAC devolvió un enlace inválido: ${href}`);
  }
  if (url.protocol !== 'https:' || url.origin !== BASE_URL) {
    throw new Error(`CvLAC devolvió un enlace fuera de su origen permitido: ${url.origin}`);
  }
  return url.toString();
}

export function isCvLacUrl(href: string): boolean {
  try {
    toCvLacUrl(href);
    return true;
  } catch {
    return false;
  }
}

export const URLS = {
  login:                `${BASE_URL}/cvlac/Login/pre_s_login.do`,
  inicio:               `${BASE_URL}/cvlac/EnRecursoHumano/inicio.do`,
  // List pages
  formacion:            `${BASE_URL}/cvlac/EnTrayectoriaEscolar/all.do?isTrayectoria=TE`,
  experiencia:          `${BASE_URL}/cvlac/EnTrayectoriaProfesional/all.do`,
  // "cursos" is EnProdCurso (courses taught), not EnFormacionComple (courses taken).
  // See docs/cvlac-findings.md — the two are distinct sections in CvLAC.
  cursos:               `${BASE_URL}/cvlac/EnProdCurso/all.do?__tipo=2B`,
  reconocimientos:      `${BASE_URL}/cvlac/EnReconocimiento/all.do`,
  // Create/form pages
  formacionCreate:      `${BASE_URL}/cvlac/EnTrayectoriaEscolar/create.do?isTrayectoria=TE`,
  experienciaCreate:    `${BASE_URL}/cvlac/EnTrayectoriaProfesional/create.do`,
  cursosCreate:         `${BASE_URL}/cvlac/EnProdCurso/create.do?__tipo=2B`,
  reconocimientosCreate:`${BASE_URL}/cvlac/EnReconocimiento/create.do`,
  proyectos:            `${BASE_URL}/cvlac/EnProyecto/all.do`,
  proyectosCreate:      `${BASE_URL}/cvlac/EnProyecto/create.do`,
  software:             `${BASE_URL}/cvlac/EnProdSoftware/all.do`,
  softwareCreate:       `${BASE_URL}/cvlac/EnProdSoftware/create.do`,
  eventos:              `${BASE_URL}/cvlac/EnEventoCientifico/all.do`,
  eventosCreate:        `${BASE_URL}/cvlac/EnEventoCientifico/create.do`,
  // Two singleton records: no list, no create/edit split. `create.do` is both
  // the read view and the form, and its `insert.do` rewrites the whole set.
  // Only the list lives under EnFormacionComple; create/edit/delete/detail are
  // EnTrayectoriaEscolar with isTrayectoria=FC — the same module as formacion.
  formacionComple:      `${BASE_URL}/cvlac/EnFormacionComple/all.do?isTrayectoria=FC`,
  formacionCompleCreate:`${BASE_URL}/cvlac/EnTrayectoriaEscolar/create.do?isTrayectoria=FC`,
  idiomas:              `${BASE_URL}/cvlac/ReRecursoHumIdioma/all.do`,
  idiomasCreate:        `${BASE_URL}/cvlac/ReRecursoHumIdioma/create.do`,
  // The `?decorator=T&null` is literal: without it create.do answers a page
  // with no form at all.
  lineas:               `${BASE_URL}/cvlac/EnLineaInv/all.do`,
  lineasCreate:         `${BASE_URL}/cvlac/EnLineaInv/create.do?decorator=T&null`,
  demasTrabajos:        `${BASE_URL}/cvlac/EnProdTecnica/all_demasTrabajos.do`,
  demasTrabajosCreate:  `${BASE_URL}/cvlac/EnProdTecnica/create_demasTrabajos.do`,
  articulos:            `${BASE_URL}/cvlac/EnProdArticulo/all.do`,
  articulosCreate:      `${BASE_URL}/cvlac/EnProdArticulo/create.do`,
  jurados:              `${BASE_URL}/cvlac/EnTesisOrientada/all_jurado.do?__tipo=A1`,
  juradosCreate:        `${BASE_URL}/cvlac/EnTesisOrientada/create_jurado.do`,
  tesis:                `${BASE_URL}/cvlac/EnTesisOrientada/all.do`,
  tesisCreate:          `${BASE_URL}/cvlac/EnTesisOrientada/create.do`,
  capitulos:            `${BASE_URL}/cvlac/EnProdCapituloLibro/all.do`,
  capitulosCreate:      `${BASE_URL}/cvlac/EnProdCapituloLibro/create.do`,
  libros:               `${BASE_URL}/cvlac/EnLibro/all.do`,
  librosCreate:         `${BASE_URL}/cvlac/EnLibro/create.do`,
  informesTecnicos:          `${BASE_URL}/cvlac/EnProdTecnologico/all_trabajo_tecnico.do`,
  informesTecnicosCreate:    `${BASE_URL}/cvlac/EnProdTecnologico/create_trabajo_tecnico.do`,
  innovacionesProceso:       `${BASE_URL}/cvlac/EnProdTecnologico/all_proceso.do?__tipo=23`,
  innovacionesProcesoCreate: `${BASE_URL}/cvlac/EnProdTecnologico/create_proceso.do`,
  productosTecnologicos:       `${BASE_URL}/cvlac/EnProdTecnologico/all_producto_tecnologico.do?__tipo=22`,
  productosTecnologicosCreate: `${BASE_URL}/cvlac/EnProdTecnologico/create_producto_tecnologico.do`,
  consultorias:              `${BASE_URL}/cvlac/EnProdConsultoria/all_consultoria.do`,
  consultoriasCreate:       `${BASE_URL}/cvlac/EnProdConsultoria/create_consultoria.do`,
  prototipos:               `${BASE_URL}/cvlac/EnProdPrototipo/all.do`,
  prototiposCreate:         `${BASE_URL}/cvlac/EnProdPrototipo/create.do`,
  areas:                `${BASE_URL}/cvlac/ReRecursoHumAreaCon/detail.do`,
  // The popup that carries the whole knowledge-area catalogue as JS globals.
  areasCatalogo:        `${BASE_URL}/cvlac/popup/ReProductoAreaCon/areaAll.do?pro=false`,
  redes:                `${BASE_URL}/cvlac/ReRedSocialIdent/create.do`,
  perfil:               `${BASE_URL}/cvlac/EnRecursoHumano/enPerfilInvestigador.do`,
} as const;

export type CvLACUrl = (typeof URLS)[keyof typeof URLS];

/**
 * Where each section's records are listed, and which cell of a row carries the
 * label a human would search by.
 *
 * Shared by `update-section` (to find the Editar/Eliminar link of a row) and by
 * `read-cvlac-detail` (to find its Detalles link), so the two can never disagree
 * about which column holds the name.
 */
export const SECTION_LIST: Record<
  CvLACSectionName,
  { listUrl: string; matchCellIndex: number }
> = {
  // Formación lists institution and dates first; the degree — what anyone would
  // search by — sits in cell 5.
  formacion:       { listUrl: URLS.formacion,        matchCellIndex: 5 },
  experiencia:     { listUrl: URLS.experiencia,      matchCellIndex: 1 },
  cursos:          { listUrl: URLS.cursos,           matchCellIndex: 1 },
  reconocimientos: { listUrl: URLS.reconocimientos,  matchCellIndex: 1 },
  proyectos:       { listUrl: URLS.proyectos,        matchCellIndex: 1 },
  software:        { listUrl: URLS.software,         matchCellIndex: 1 },
  eventos:         { listUrl: URLS.eventos,          matchCellIndex: 1 },
  formacionComple: { listUrl: URLS.formacionComple,  matchCellIndex: 5 },
  idiomas:         { listUrl: URLS.idiomas,          matchCellIndex: 1 },
  lineas:          { listUrl: URLS.lineas,           matchCellIndex: 1 },
  demasTrabajos:   { listUrl: URLS.demasTrabajos,    matchCellIndex: 1 },
  articulos:       { listUrl: URLS.articulos,        matchCellIndex: 1 },
  jurados:         { listUrl: URLS.jurados,          matchCellIndex: 1 },
  tesis:           { listUrl: URLS.tesis,            matchCellIndex: 1 },
  capitulos:       { listUrl: URLS.capitulos,        matchCellIndex: 1 },
  libros:          { listUrl: URLS.libros,           matchCellIndex: 1 },
  informesTecnicos:      { listUrl: URLS.informesTecnicos,      matchCellIndex: 1 },
  innovacionesProceso:   { listUrl: URLS.innovacionesProceso,   matchCellIndex: 1 },
  productosTecnologicos: { listUrl: URLS.productosTecnologicos, matchCellIndex: 1 },
  consultorias:          { listUrl: URLS.consultorias,          matchCellIndex: 1 },
  prototipos:            { listUrl: URLS.prototipos,            matchCellIndex: 1 },
};

/**
 * True for a page that only shows something, so loading it again is harmless.
 *
 * CvLAC performs its writes as plain GETs — a delete is a link to
 * `delete*.do` — so reopening "the last page visited" can repeat a write. Only
 * list, record and form views qualify; anything else is refused, not guessed.
 */
export function isSafeToReload(url: string): boolean {
  let path: string;
  try {
    const resolved = new URL(url);
    if (resolved.protocol !== 'https:' || resolved.origin !== BASE_URL) return false;
    path = resolved.pathname;
  } catch {
    return false;
  }
  if (/(delete|remove|borrar|eliminar|insert|update|save|guardar)\w*\.do$/i.test(path)) return false;
  return /\/(all\w*|detail|detalle|inicio|create\w*|edit\w*|enPerfilInvestigador|areaAll)\.do$/.test(path);
}
