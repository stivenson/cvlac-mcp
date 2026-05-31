import type { Page } from 'playwright';
import type { CvLACCursoItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';

export async function extractCursos(page: Page): Promise<CvLACCursoItem[]> {
  await page.goto(URLS.cursos, { waitUntil: 'domcontentloaded', timeout: 20000 });

  const items = await page.$$eval(
    'tr.odd, tr.even',
    (rows) =>
      rows
        .map((row) => {
          const cells = Array.from(row.querySelectorAll('td'));
          // Columns: [num, nombre, año, ...]
          if (cells.length < 2) return null;
          return {
            name: cells[1]?.textContent?.trim() ?? '',
            date: cells[2]?.textContent?.trim() ?? '',
          };
        })
        .filter(Boolean)
  ) as CvLACCursoItem[];

  return items.filter((i) => i.name.length > 0);
}
