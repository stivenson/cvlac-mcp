import type { Page } from 'playwright';
import type { CvLACCursoItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';
import { extractList, mapRows } from './rows.js';

/** Columns: [num, nombre, año, categoría, ...acciones] */
function mapCurso(cells: string[]): CvLACCursoItem | null {
  const name = cells[1] ?? '';
  if (!name) return null;
  return { name, date: cells[2] ?? '' };
}

/** Maps the rows of an already-loaded cursos list page. */
export async function extractCursosFromPage(page: Page): Promise<CvLACCursoItem[]> {
  return mapRows(page, 'cursos', 2, mapCurso);
}

export async function extractCursos(page: Page): Promise<CvLACCursoItem[]> {
  return extractList(page, 'cursos', URLS.cursos, 2, mapCurso);
}
