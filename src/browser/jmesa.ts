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

/**
 * A list walk that could not read every row it says it has.
 *
 * Callers that guard against duplicates or look a row up to update/delete it
 * must never treat this as "not found" — that reads a page 1 miss as "nothing
 * there" and either creates a duplicate or fails silently on the wrong row.
 */
export class IncompleteListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IncompleteListError';
  }
}

function incomplete(listUrl: string, status: ListPageStatus): IncompleteListError {
  return new IncompleteListError(
    `CvLAC mostró ${status.to} de ${status.total} filas de ${listUrl} y no se pudieron leer las demás.`
  );
}

/** Navigates to a URL and hands back the page to read — it may be a new one after a re-login. */
export type ListNavigator = (url: string) => Promise<Page>;

/** A page's status bar, or null when the list has no status bar (it fits on one page, or it is empty). */
export type ListVisitor<T> = (page: Page, status: ListPageStatus | null) => Promise<T | undefined>;

/**
 * Visits each page of a list until `visit` returns something other than `undefined`
 * (including `null`, `false` or `0` — anything but `undefined` stops the walk and
 * is returned as is). `undefined` means "keep going".
 *
 * The list is opened as is first: most sections fit in one page, and that costs
 * nothing extra. Only when its status bar says rows are missing does it walk
 * pages of MAX_ROWS, driven by each page's own status bar rather than a page
 * count computed once from the first total — CvLAC does not promise `_mr_` is
 * honored. Throws `IncompleteListError` rather than quietly returning a partial
 * read when the walk cannot be trusted to have covered every row.
 */
export async function visitListPages<T>(
  listUrl: string,
  go: ListNavigator,
  visit: ListVisitor<T>
): Promise<T | undefined> {
  const first = await go(listUrl);
  const { tableId, status } = await readListState(first);

  if (!status || status.to >= status.total) return visit(first, status);

  if (!tableId) {
    // A status bar with missing rows but no table id means there is no way to
    // build a paged URL for this list — this is broken markup, not an empty list.
    throw incomplete(listUrl, status);
  }

  log.debug('list spans several pages', { listUrl, total: status.total });
  const cap = Math.ceil(status.total / MAX_ROWS) + 2;
  let last = status;
  for (let p = 1; p <= cap; p++) {
    const current = await go(pagedListUrl(listUrl, tableId, p));
    const state = await readListState(current);
    if (!state.status) throw incomplete(listUrl, last);

    const hit = await visit(current, state.status);
    if (hit !== undefined) return hit;

    if (state.status.to >= state.status.total) return undefined;
    if (state.status.to <= last.to) {
      // The server ignored or capped `_mr_`: the page did not advance, so walking
      // further would only repeat rows already seen (or loop forever).
      throw incomplete(listUrl, state.status);
    }
    last = state.status;
  }
  throw incomplete(listUrl, last);
}

/** Reads every page of a list and concatenates what `read` returns for each. */
export async function collectListPages<T>(
  listUrl: string,
  go: ListNavigator,
  read: (page: Page, status: ListPageStatus | null) => Promise<T[]>
): Promise<T[]> {
  const out: T[] = [];
  let total: number | null = null;
  await visitListPages<never>(listUrl, go, async (current, status) => {
    out.push(...(await read(current, status)));
    total = status?.total ?? total;
    return undefined;
  });
  if (total !== null && out.length < total) {
    // `read` maps each row to an item and drops the ones it cannot map; ending up
    // with fewer items than the status bar's total is a mapping gap, not a paging
    // one (a paging gap throws instead) — worth a line so it does not go unnoticed.
    log.warn('list read fewer rows than it reports', { listUrl, read: out.length, total });
  }
  return out;
}
