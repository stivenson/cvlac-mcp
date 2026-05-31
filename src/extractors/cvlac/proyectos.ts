import type { Page } from 'playwright';
import type { CvLACProyectoItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';

export async function extractProyectos(page: Page): Promise<CvLACProyectoItem[]> {
  await page.goto(URLS.proyectos, { waitUntil: 'domcontentloaded', timeout: 20000 });

  const items = await page.$$eval(
    'tr.odd, tr.even',
    (rows) =>
      rows
        .map((row) => {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 2) return null;
          return { title: cells[1]?.textContent?.trim() ?? '' };
        })
        .filter(Boolean)
  ) as CvLACProyectoItem[];

  return items.filter((i) => i.title.length > 0);
}
