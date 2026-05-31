import type { Page } from 'playwright';
import type { CvLACFormacionItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';

export async function extractFormacion(page: Page): Promise<CvLACFormacionItem[]> {
  await page.goto(URLS.formacion, { waitUntil: 'domcontentloaded', timeout: 20000 });

  const items = await page.$$eval(
    'tr.odd, tr.even',
    (rows) =>
      rows
        .map((row) => {
          const cells = Array.from(row.querySelectorAll('td'));
          // Columns: [num, año_inicio, nivel, año_fin, institución, programa, ...]
          if (cells.length < 5) return null;
          return {
            institution: cells[4]?.textContent?.trim() ?? '',
            degree: cells[5]?.textContent?.trim() ?? '',
            period: `${cells[1]?.textContent?.trim() ?? ''}-${cells[3]?.textContent?.trim() ?? ''}`,
          };
        })
        .filter(Boolean)
  ) as CvLACFormacionItem[];

  return items.filter((i) => i.institution.length > 0);
}
