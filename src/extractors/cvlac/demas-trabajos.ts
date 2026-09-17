import type { Page } from 'playwright';
import type { CvLACDemasTrabajoItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';
import { extractList, mapRows } from './rows.js';

/** Columns: [num, nombre, año, Detalles, Editar, Eliminar] */
function mapDemasTrabajo(cells: string[]): CvLACDemasTrabajoItem | null {
  const name = cells[1] ?? '';
  if (!name) return null;
  return { name, year: cells[2] ?? '' };
}

export async function extractDemasTrabajosFromPage(page: Page): Promise<CvLACDemasTrabajoItem[]> {
  return mapRows(page, 'demasTrabajos', 3, mapDemasTrabajo);
}

export async function extractDemasTrabajos(page: Page): Promise<CvLACDemasTrabajoItem[]> {
  return extractList(page, 'demasTrabajos', URLS.demasTrabajos, 3, mapDemasTrabajo);
}
