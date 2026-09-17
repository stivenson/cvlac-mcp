import type { Page } from 'playwright';
import type { CvLACFormacionItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';
import { extractList, mapRows } from './rows.js';

/**
 * Columns: [num, año inicio, nivel, año graduación, institución, programa, ...acciones].
 *
 * Shared with formación complementaria, which is the same list under a different
 * `isTrayectoria`.
 */
export function mapFormacionRow(cells: string[]): CvLACFormacionItem | null {
  const institution = cells[4] ?? '';
  if (!institution) return null;
  return {
    institution,
    degree: cells[5] ?? '',
    period: `${cells[1] ?? ''}-${cells[3] ?? ''}`,
  };
}

/** Maps the rows of an already-loaded formación list page. */
export async function extractFormacionFromPage(page: Page): Promise<CvLACFormacionItem[]> {
  return mapRows(page, 'formacion', 5, mapFormacionRow);
}

export async function extractFormacion(page: Page): Promise<CvLACFormacionItem[]> {
  return extractList(page, 'formacion', URLS.formacion, 5, mapFormacionRow);
}
