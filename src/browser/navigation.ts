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
} as const;

export type CvLACUrl = (typeof URLS)[keyof typeof URLS];
