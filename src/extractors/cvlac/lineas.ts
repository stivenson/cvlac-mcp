import type { Page } from 'playwright';
import type { CvLACLineaItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';
import { extractList, mapRows } from './rows.js';

/**
 * Columns: [num, nombre, Detalles, Editar, Eliminar].
 *
 * The list carries nothing else: whether the line is active and what its object
 * is live on the record page, so a diff can only compare names.
 */
function mapLinea(cells: string[]): CvLACLineaItem | null {
  const name = cells[1] ?? '';
  if (!name) return null;
  return { name };
}

export async function extractLineasFromPage(page: Page): Promise<CvLACLineaItem[]> {
  return mapRows(page, 'lineas', 2, mapLinea);
}

export async function extractLineas(page: Page): Promise<CvLACLineaItem[]> {
  return extractList(page, 'lineas', URLS.lineas, 2, mapLinea);
}
