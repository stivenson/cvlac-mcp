import type { Page } from 'playwright';
import type { CvLACSoftwareItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';
import { extractList, mapRows } from './rows.js';

/** Columns: [num, nombre, año, categoría, ...acciones] */
function mapSoftware(cells: string[]): CvLACSoftwareItem | null {
  const name = cells[1] ?? '';
  if (!name) return null;
  return { name };
}

/** Maps the rows of an already-loaded software list page. */
export async function extractSoftwareFromPage(page: Page): Promise<CvLACSoftwareItem[]> {
  return mapRows(page, 'software', 2, mapSoftware);
}

export async function extractSoftware(page: Page): Promise<CvLACSoftwareItem[]> {
  return extractList(page, 'software', URLS.software, 2, mapSoftware);
}
