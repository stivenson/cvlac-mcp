/**
 * CvLAC's list pages are JMesa tables: 15 rows a page unless asked otherwise,
 * with a status bar that says how many rows exist in all.
 *
 * Reading only the page a list opens on missed row 16 onwards — in the
 * duplicate guard too, so a repeated add went through. Paging is plain URL
 * parameters and leaves nothing behind in the session.
 */
import type { Page } from 'playwright';

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
