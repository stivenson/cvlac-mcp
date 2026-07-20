import type { Page } from 'playwright';
import type { CvLACProyectoItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';
import { extractList, mapRows } from './rows.js';

/** Columns: [num, nombre, año inicio, categoría, ...acciones] */
function mapProyecto(cells: string[]): CvLACProyectoItem | null {
  const title = cells[1] ?? '';
  if (!title) return null;
  return { title };
}

/** Maps the rows of an already-loaded proyectos list page. */
export async function extractProyectosFromPage(page: Page): Promise<CvLACProyectoItem[]> {
  return mapRows(page, 'proyectos', 2, mapProyecto);
}

export async function extractProyectos(page: Page): Promise<CvLACProyectoItem[]> {
  return extractList(page, 'proyectos', URLS.proyectos, 2, mapProyecto);
}
