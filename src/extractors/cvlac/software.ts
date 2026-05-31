import type { Page } from 'playwright';
import type { CvLACSoftwareItem } from '../../types.js';
import { URLS } from '../../browser/navigation.js';

export async function extractSoftware(page: Page): Promise<CvLACSoftwareItem[]> {
  await page.goto(URLS.software, { waitUntil: 'domcontentloaded', timeout: 20000 });

  const items = await page.$$eval(
    'tr.odd, tr.even',
    (rows) =>
      rows
        .map((row) => {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 2) return null;
          return { name: cells[1]?.textContent?.trim() ?? '' };
        })
        .filter(Boolean)
  ) as CvLACSoftwareItem[];

  return items.filter((i) => i.name.length > 0);
}
