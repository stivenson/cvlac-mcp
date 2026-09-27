/**
 * CvLAC's list pages are JMesa tables: 15 rows a page unless asked otherwise,
 * with a status bar that says how many rows exist in all.
 *
 * Reading only the page a list opens on missed row 16 onwards — in the
 * duplicate guard too, so a repeated add went through. Paging is plain URL
 * parameters and leaves nothing behind in the session.
 */
import type { Page } from 'playwright';
import { createLogger } from '../logger.js';

const log = createLogger('jmesa');

/** The widest page JMesa offers here (its select lists 15, 50 and 100). */
export const MAX_ROWS = 100;

export interface ListPageStatus {
  from: number;
  to: number;
  total: number;
}

export function parseStatusBar(text: string | null | undefined): ListPageStatus | null {
  const m = /Resultados\s+(\d+)\s*-\s*(\d+)\s+de\s+(\d+)/i.exec(text ?? '');
  return m ? { from: Number(m[1]), to: Number(m[2]), total: Number(m[3]) } : null;
}

export function pagedListUrl(listUrl: string, tableId: string, pageNo: number, maxRows = MAX_ROWS): string {
  const url = new URL(listUrl);
  url.searchParams.set(`${tableId}_mr_`, String(maxRows));
  url.searchParams.set(`${tableId}_p_`, String(pageNo));
  return url.toString();
}

/** The table id and the status bar of the list the page is showing. */
export async function readListState(
  page: Page
): Promise<{ tableId: string | null; status: ListPageStatus | null }> {
  const raw = await page.evaluate(() => ({
    tableId: document.querySelector('table.table[id]')?.id ?? null,
    status: document.querySelector('tr.statusBar')?.textContent ?? null,
  }));
  return { tableId: raw.tableId, status: parseStatusBar(raw.status) };
}

/** Navigates to a URL and hands back the page to read — it may be a new one after a re-login. */
export type ListNavigator = (url: string) => Promise<Page>;

/**
 * Visits each page of a list until `visit` returns something.
 *
 * The list is opened as is first: most sections fit in one page, and that costs
 * nothing extra. Only when the status bar says rows are missing does it walk
 * pages of MAX_ROWS.
 */
export async function visitListPages<T>(
  page: Page,
  listUrl: string,
  go: ListNavigator,
  visit: (page: Page) => Promise<T | undefined>
): Promise<T | undefined> {
  let current = await go(listUrl);
  const { tableId, status } = await readListState(current);
  if (!tableId || !status || status.to >= status.total) return visit(current);

  const pages = Math.ceil(status.total / MAX_ROWS);
  log.debug('list spans several pages', { listUrl, total: status.total, pages });
  for (let p = 1; p <= pages; p++) {
    current = await go(pagedListUrl(listUrl, tableId, p));
    const hit = await visit(current);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** Reads every page of a list and concatenates what `read` returns for each. */
export async function collectListPages<T>(
  page: Page,
  listUrl: string,
  go: ListNavigator,
  read: (page: Page) => Promise<T[]>
): Promise<T[]> {
  const out: T[] = [];
  let expected: number | null = null;
  await visitListPages(page, listUrl, go, async (current) => {
    out.push(...(await read(current)));
    expected = (await readListState(current)).status?.total ?? expected;
    return undefined;
  });
  if (expected !== null && out.length < expected) {
    // `read` drops rows it cannot map; fewer than the status bar says is worth a line.
    log.warn('list read fewer rows than it reports', { listUrl, read: out.length, total: expected });
  }
  return out;
}
