import type { Page } from 'playwright';
import type { CvLACReconocimientoItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';

export async function extractReconocimientos(page: Page): Promise<CvLACReconocimientoItem[]> {
  await page.goto(URLS.reconocimientos, { waitUntil: 'domcontentloaded', timeout: 20000 });

  const items = await page.$$eval(
    'tr.odd, tr.even',
    (rows) =>
      rows
        .map((row) => {
          const cells = Array.from(row.querySelectorAll('td'));
          // Real columns (verified live): [num, Título, Año, Detalles, Editar, Eliminar]
          if (cells.length < 2) return null;
          return {
            title: cells[1]?.textContent?.trim() ?? '',
            // cells[2] is the year, not a description — the list has no description column
            year: cells[2]?.textContent?.trim() ?? '',
          };
        })
        .filter(Boolean)
  ) as CvLACReconocimientoItem[];

  return items.filter((i) => i.title.length > 0);
}
