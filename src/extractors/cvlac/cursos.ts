import type { Page } from 'playwright';
import type { CvLACCursoItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';

export async function extractCursos(page: Page): Promise<CvLACCursoItem[]> {
  await page.goto(URLS.cursos, { waitUntil: 'domcontentloaded', timeout: 15000 });

  const items = await page.$$eval(
    'table.itemProd tr, .itemCurso, [class*="complementaria"] tr',
    (rows) =>
      rows
        .map((row) => {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 1) return null;
          return {
            name: cells[0]?.textContent?.trim() ?? '',
            date: cells[1]?.textContent?.trim() ?? '',
          };
        })
        .filter(Boolean)
  ) as CvLACCursoItem[];

  return items.filter((i) => i.name.length > 0);
}
