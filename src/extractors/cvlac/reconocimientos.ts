import type { Page } from 'playwright';
import type { CvLACReconocimientoItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';
import { extractList, mapRows } from './rows.js';

/** Columns (verified live): [num, título, año, Detalles, Editar, Eliminar] */
function mapReconocimiento(cells: string[]): CvLACReconocimientoItem | null {
  const title = cells[1] ?? '';
  if (!title) return null;
  // cells[2] is the year — the list view has no description column.
  return { title, year: cells[2] ?? '' };
}

/** Maps the rows of an already-loaded reconocimientos list page. */
export async function extractReconocimientosFromPage(page: Page): Promise<CvLACReconocimientoItem[]> {
  return mapRows(page, 'reconocimientos', 2, mapReconocimiento);
}

export async function extractReconocimientos(page: Page): Promise<CvLACReconocimientoItem[]> {
  return extractList(page, 'reconocimientos', URLS.reconocimientos, 2, mapReconocimiento);
}
