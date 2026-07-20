import type { Page } from 'playwright';
import type { CvLACExperienciaItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';
import { extractList, mapRows } from './rows.js';

/** Columns (verified live): [num, institución, año inicio, año fin, filiación actual, ...acciones] */
function mapExperiencia(cells: string[]): CvLACExperienciaItem | null {
  const company = cells[1] ?? '';
  if (!company) return null;
  return {
    company,
    // Role/cargo is NOT in the list view (only on the detail page). Experiencia is
    // excluded from the diff anyway (managed manually), so we don't fetch details.
    role: '',
    period: `${cells[2] ?? ''}-${cells[3] ?? ''}`,
  };
}

/** Maps the rows of an already-loaded experiencia list page. */
export async function extractExperienciaFromPage(page: Page): Promise<CvLACExperienciaItem[]> {
  return mapRows(page, 'experiencia', 3, mapExperiencia);
}

export async function extractExperiencia(page: Page): Promise<CvLACExperienciaItem[]> {
  return extractList(page, 'experiencia', URLS.experiencia, 3, mapExperiencia);
}
