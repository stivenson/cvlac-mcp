import type { Page } from 'playwright';
import type { CvLACIdiomaItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';
import { extractList, mapRows } from './rows.js';

/**
 * Columns: [num, idioma, leer, escribir, hablar, escuchar, Detalles, Editar, Eliminar].
 *
 * The four levels are in the order the create form lists its radio groups. They
 * read the same on an account whose levels are all equal, so the order is
 * pinned here and checked against the live list by the e2e suite.
 */
function mapIdioma(cells: string[]): CvLACIdiomaItem | null {
  const language = cells[1] ?? '';
  if (!language) return null;
  return {
    language,
    read: cells[2] ?? '',
    write: cells[3] ?? '',
    speak: cells[4] ?? '',
    listen: cells[5] ?? '',
  };
}

export async function extractIdiomasFromPage(page: Page): Promise<CvLACIdiomaItem[]> {
  return mapRows(page, 'idiomas', 6, mapIdioma);
}

export async function extractIdiomas(page: Page): Promise<CvLACIdiomaItem[]> {
  return extractList(page, 'idiomas', URLS.idiomas, 6, mapIdioma);
}
