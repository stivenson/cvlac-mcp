import type { CvLACSectionName } from '../types.js';

export const BASE_URL = 'https://scienti.minciencias.gov.co';

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
};
