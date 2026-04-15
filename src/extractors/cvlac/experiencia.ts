import type { Page } from 'playwright';
import type { CvLACExperienciaItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';

export async function extractExperiencia(page: Page): Promise<CvLACExperienciaItem[]> {
  await page.goto(URLS.experiencia, { waitUntil: 'domcontentloaded', timeout: 15000 });

  const items = await page.$$eval(
    'table.itemProd tr, .itemExperiencia, [class*="experiencia"] tr',
    (rows) =>
      rows
        .map((row) => {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 2) return null;
          return {
            company: cells[0]?.textContent?.trim() ?? '',
            role: cells[1]?.textContent?.trim() ?? '',
            period: cells[2]?.textContent?.trim() ?? '',
          };
        })
        .filter(Boolean)
  ) as CvLACExperienciaItem[];

  return items.filter((i) => i.company.length > 0);
}
