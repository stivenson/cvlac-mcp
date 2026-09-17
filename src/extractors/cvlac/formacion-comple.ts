import type { Page } from 'playwright';
import type { CvLACFormacionItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';
import { extractList } from './rows.js';
import { mapFormacionRow } from './formacion.js';

/**
 * Formación complementaria lists exactly like formación académica — same module,
 * same columns — so it reads with the same mapper under a different URL.
 */
export async function extractFormacionComple(page: Page): Promise<CvLACFormacionItem[]> {
  return extractList(page, 'formacionComple', URLS.formacionComple, 5, mapFormacionRow);
}
