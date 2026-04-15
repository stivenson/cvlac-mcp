export const BASE_URL = 'https://scienti.minciencias.gov.co';

export const URLS = {
  login:           `${BASE_URL}/cvlac/Login/pre_s_login.do`,
  loginPost:       `${BASE_URL}/cvlac/Login/s_login.do`,
  inicio:          `${BASE_URL}/cvlac/EnRecursoHumano/inicio.do`,
  datosGenerales:  `${BASE_URL}/cvlac/EnRecursoHumano/datosGenerales.do`,
  formacion:       `${BASE_URL}/cvlac/EnRecursoHumano/formacionAcademica.do`,
  experiencia:     `${BASE_URL}/cvlac/EnRecursoHumano/experienciaProfesional.do`,
  cursos:          `${BASE_URL}/cvlac/EnRecursoHumano/formacionComplementaria.do`,
  reconocimientos: `${BASE_URL}/cvlac/EnRecursoHumano/reconocimientos.do`,
} as const;

export type CvLACUrl = (typeof URLS)[keyof typeof URLS];

/** Returns true if the page title indicates a successful authenticated session */
export function isLoggedIn(title: string): boolean {
  return !title.includes('Ingresar') && !title.includes('Login') && title.length > 0;
}
