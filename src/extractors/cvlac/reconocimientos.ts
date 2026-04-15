import type { Page } from 'playwright';
import type { CvLACReconocimientoItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';

export async function extractReconocimientos(page: Page): Promise<CvLACReconocimientoItem[]> {
  await page.goto(URLS.reconocimientos, { waitUntil: 'domcontentloaded', timeout: 15000 });

  const items = await page.$$eval(
    'table.itemProd tr, .itemReconocimiento, [class*="reconocimiento"] tr',
    (rows) =>
      rows
        .map((row) => {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 1) return null;
          return {
            title: cells[0]?.textContent?.trim() ?? '',
            description: cells[1]?.textContent?.trim() ?? '',
          };
        })
        .filter(Boolean)
  ) as CvLACReconocimientoItem[];

  return items.filter((i) => i.title.length > 0);
}
