import type { Page } from 'playwright';
import type { CvLACExperienciaItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';

export async function extractExperiencia(page: Page): Promise<CvLACExperienciaItem[]> {
  await page.goto(URLS.experiencia, { waitUntil: 'domcontentloaded', timeout: 20000 });

  const items = await page.$$eval(
    'tr.odd, tr.even',
    (rows) =>
      rows
        .map((row) => {
          const cells = Array.from(row.querySelectorAll('td'));
          // Real columns (verified live): [num, Institución, Año inicio, Año fin, Filiación actual, ...]
          if (cells.length < 3) return null;
          return {
            company: cells[1]?.textContent?.trim() ?? '',
            // Role/cargo is NOT in the list view (only on the detail page). Experiencia is
            // excluded from the diff anyway (managed manually), so we don't fetch details.
            role: '',
            period: `${cells[2]?.textContent?.trim() ?? ''}-${cells[3]?.textContent?.trim() ?? ''}`,
          };
        })
        .filter(Boolean)
  ) as CvLACExperienciaItem[];

  return items.filter((i) => i.company.length > 0);
}
