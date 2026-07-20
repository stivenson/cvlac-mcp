import type { Page } from 'playwright';
import type { CvLACEventoItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';
import { extractList, mapRows } from './rows.js';

/** Columns: [num, evento, fecha inicio, ...acciones] */
function mapEvento(cells: string[]): CvLACEventoItem | null {
  const name = cells[1] ?? '';
  if (!name) return null;
  return { name };
}

/** Maps the rows of an already-loaded eventos list page. */
export async function extractEventosFromPage(page: Page): Promise<CvLACEventoItem[]> {
  return mapRows(page, 'eventos', 2, mapEvento);
}

export async function extractEventos(page: Page): Promise<CvLACEventoItem[]> {
  return extractList(page, 'eventos', URLS.eventos, 2, mapEvento);
}
