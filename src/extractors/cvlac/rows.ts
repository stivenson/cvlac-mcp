import type { Page } from 'playwright';
import { createLogger } from '../../logger.js';

const log = createLogger('extract');

/**
 * Reads the data rows of a CvLAC list page as arrays of cell text.
 *
 * Every `all.do` list renders its records as `tr.odd` / `tr.even`; the first cell
 * is the row number and the last three are the Detalles/Editar/Eliminar links.
 * Splitting this out from navigation lets tests drive it with `page.setContent`.
 */
export async function readRows(page: Page): Promise<string[][]> {
  return page.$$eval('tr.odd, tr.even', (rows) =>
    rows.map((row) =>
      Array.from(row.querySelectorAll('td')).map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim())
    )
  );
}

/**
 * Maps list rows to items, dropping the ones the mapper rejects.
 *
 * An empty result is reported: it usually means CvLAC changed its markup rather
 * than the section being empty, and that used to fail silently.
 */
export async function mapRows<T>(
  page: Page,
  section: string,
  minCells: number,
  map: (cells: string[]) => T | null
): Promise<T[]> {
  const rows = await readRows(page);
  const items = rows
    .filter((cells) => cells.length >= minCells)
    .map(map)
    .filter((i): i is T => i !== null);

  if (rows.length === 0) {
    log.warn('list page had no data rows; markup may have changed', { section, url: page.url() });
  } else if (items.length === 0) {
    log.warn('rows found but none usable; column layout may have changed', {
      section,
      rows: rows.length,
    });
  } else {
    log.debug('rows extracted', { section, count: items.length });
  }
  return items;
}

/** Navigates to a list page and maps its rows. */
export async function extractList<T>(
  page: Page,
  section: string,
  url: string,
  minCells: number,
  map: (cells: string[]) => T | null
): Promise<T[]> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  return mapRows(page, section, minCells, map);
}
