import type { Page } from 'playwright';
import type { CvLACFormacionItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';

export async function extractFormacion(page: Page): Promise<CvLACFormacionItem[]> {
  await page.goto(URLS.formacion, { waitUntil: 'domcontentloaded', timeout: 15000 });

  const items = await page.$$eval(
    'table.itemProd tr, .itemFormacion, [class*="formacion"] tr',
    (rows) =>
      rows
        .map((row) => {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 2) return null;
          return {
            institution: cells[0]?.textContent?.trim() ?? '',
            degree: cells[1]?.textContent?.trim() ?? '',
            period: cells[2]?.textContent?.trim() ?? '',
          };
        })
        .filter(Boolean)
  ) as CvLACFormacionItem[];

  return items.filter((i) => i.institution.length > 0);
}
