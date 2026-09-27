import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import {
  parseStatusBar,
  pagedListUrl,
  MAX_ROWS,
  collectListPages,
  visitListPages,
  IncompleteListError,
} from '../src/browser/jmesa.js';

describe('parseStatusBar', () => {
  it('reads the range and the total', () => {
    expect(parseStatusBar('Resultados 1 - 9 de 9.')).toEqual({ from: 1, to: 9, total: 9 });
    expect(parseStatusBar('  Resultados 16 - 30 de 212. ')).toEqual({ from: 16, to: 30, total: 212 });
  });

  // An empty list shows "Ningún dato disponible" and no status bar at all.
  it('returns null when there is no status bar', () => {
    expect(parseStatusBar(undefined)).toBeNull();
    expect(parseStatusBar('Ningún dato disponible en esta tabla')).toBeNull();
  });
});

describe('pagedListUrl', () => {
  it('keeps the list parameters and adds the table paging', () => {
    const url = new URL(
      pagedListUrl('https://x/cvlac/EnProdCurso/all.do?__tipo=2B', 'cursos_dictados_all', 2)
    );
    expect(url.searchParams.get('__tipo')).toBe('2B');
    expect(url.searchParams.get('cursos_dictados_all_mr_')).toBe(String(MAX_ROWS));
    expect(url.searchParams.get('cursos_dictados_all_p_')).toBe('2');
  });

  it('works on a list URL without a query', () => {
    expect(pagedListUrl('https://x/cvlac/EnLibro/all.do', 't', 1)).toBe(
      'https://x/cvlac/EnLibro/all.do?t_mr_=100&t_p_=1'
    );
  });
});

const LIST = 'https://scienti.minciencias.gov.co/cvlac/EnFake/all.do?__tipo=X';

/** A JMesa page holding rows `from..to` of `total`, titled "Item n". */
function listHtml(from: number, to: number, total: number): string {
  const rows = [];
  for (let n = from; n <= to; n++) {
    rows.push(
      `<tr class="${n % 2 ? 'odd' : 'even'}"><td>${n}</td><td>Item ${n}</td>` +
        `<td><a href="/cvlac/EnFake/query.do?id=${n}">Detalles</a></td>` +
        `<td><a href="/cvlac/EnFake/edit.do?id=${n}">Editar</a></td>` +
        `<td><a href="/cvlac/EnFake/confirm.do?id=${n}">Eliminar</a></td></tr>`
    );
  }
  return (
    `<table class="table" id="fake_all"><tbody>${rows.join('')}</tbody>` +
    `<tbody><tr class="statusBar"><td>Resultados ${from} - ${to} de ${total}.</td></tr></tbody></table>`
  );
}

/**
 * A JMesa page with a status bar (rows missing) but no `table.table[id]` — broken markup.
 * The status bar still needs a real `<table>` around it: a bare `<tr>` outside one is
 * dropped by the HTML parser before any selector ever sees it.
 */
function noTableHtml(to: number, total: number): string {
  return `<table><tbody><tr class="statusBar"><td>Resultados 1 - ${to} de ${total}.</td></tr></tbody></table>`;
}

/** The empty-list markup JMesa renders instead of a table and a status bar. */
const EMPTY_LIST_HTML = '<div>Ningún dato disponible en esta tabla</div>';

/** A page with a table and data rows, but no `tr.statusBar` at all — dropped mid-walk. */
function tableWithoutStatusBar(from: number, to: number): string {
  const rows = [];
  for (let n = from; n <= to; n++) {
    rows.push(`<tr class="${n % 2 ? 'odd' : 'even'}"><td>${n}</td><td>Item ${n}</td></tr>`);
  }
  return `<table class="table" id="fake_all"><tbody>${rows.join('')}</tbody></table>`;
}

describe('collectListPages / visitListPages', () => {
  let browser: Browser;
  let page: Page;
  const visited: string[] = [];

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
    const TOTAL = 212;
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnFake/**', (route) => {
      const url = new URL(route.request().url());
      visited.push(url.search);
      const mr = Number(url.searchParams.get('fake_all_mr_') ?? 15);
      const p = Number(url.searchParams.get('fake_all_p_') ?? 1);
      const from = (p - 1) * mr + 1;
      const to = Math.min(p * mr, TOTAL);
      return route.fulfill({ contentType: 'text/html', body: listHtml(from, to, TOTAL) });
    });
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnSmall/**', (route) => {
      visited.push(new URL(route.request().url()).search);
      return route.fulfill({ contentType: 'text/html', body: listHtml(1, 3, 3) });
    });
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnEmpty/**', (route) => {
      visited.push(new URL(route.request().url()).search);
      return route.fulfill({ contentType: 'text/html', body: EMPTY_LIST_HTML });
    });
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnBroken/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: noTableHtml(15, 212) })
    );
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnCapped/**', (route) => {
      // Ignores both `_mr_` and `_p_`: always the same first 15 rows of 212.
      return route.fulfill({ contentType: 'text/html', body: listHtml(1, 15, 212) });
    });
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnNoStatus/**', (route) => {
      const url = new URL(route.request().url());
      // The unpaged first fetch behaves normally (15 of 212, triggers paging);
      // every paged fetch after that comes back as a table with data rows but
      // no status bar at all — broken markup discovered only once paging starts.
      if (!url.searchParams.has('fake_all_p_')) {
        return route.fulfill({ contentType: 'text/html', body: listHtml(1, 15, 212) });
      }
      return route.fulfill({ contentType: 'text/html', body: tableWithoutStatusBar(1, 100) });
    });
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnGap/**', (route) => {
      const url = new URL(route.request().url());
      const total = 250;
      const hasP = url.searchParams.has('fake_all_p_');
      const p = hasP ? Number(url.searchParams.get('fake_all_p_')) : 1;
      if (!hasP) return route.fulfill({ contentType: 'text/html', body: listHtml(1, 15, total) });
      // Page 1 is a normal 100-row page; page 2 jumps ahead and skips rows
      // 101-120 — advancing (so it is not the "didn't advance" case) but not
      // contiguous with the page before it.
      if (p === 1) return route.fulfill({ contentType: 'text/html', body: listHtml(1, 100, total) });
      return route.fulfill({ contentType: 'text/html', body: listHtml(121, 220, total) });
    });
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnCap50/**', (route) => {
      const url = new URL(route.request().url());
      const total = 350;
      // Server caps every *paged* page at 50 rows, ignoring the `_mr_=100` this
      // code always asks for; the unpaged first fetch behaves like a normal
      // 15-row default. Pages stay contiguous — this is not the "didn't
      // advance" case, it is the safety cap (`cap = ceil(total/MAX_ROWS)+2`)
      // running out before 50-row pages can cover 350 rows.
      const hasP = url.searchParams.has('fake_all_p_');
      const p = hasP ? Number(url.searchParams.get('fake_all_p_')) : 1;
      const size = hasP ? 50 : 15;
      const from = (p - 1) * size + 1;
      const to = Math.min(from + size - 1, total);
      return route.fulfill({ contentType: 'text/html', body: listHtml(from, to, total) });
    });
  }, 60000);

  afterAll(async () => {
    await browser?.close();
  });

  const go = async (url: string): Promise<Page> => {
    await page.goto(url);
    return page;
  };
  const titles = (p: Page): Promise<string[]> =>
    p.$$eval('tr.odd, tr.even', (rows) => rows.map((r) => r.querySelectorAll('td')[1].textContent ?? ''));

  it('reads every row of a list longer than one page', async () => {
    visited.length = 0;
    const all = await collectListPages(LIST, go, titles);
    expect(all).toHaveLength(212);
    expect(all[0]).toBe('Item 1');
    expect(all[211]).toBe('Item 212');
    // First the plain list, then three pages of 100.
    expect(visited).toEqual([
      '?__tipo=X',
      '?__tipo=X&fake_all_mr_=100&fake_all_p_=1',
      '?__tipo=X&fake_all_mr_=100&fake_all_p_=2',
      '?__tipo=X&fake_all_mr_=100&fake_all_p_=3',
    ]);
  });

  it('stops at the page where the visitor finds what it wants', async () => {
    visited.length = 0;
    const hit = await visitListPages(LIST, go, async (p) => {
      const t = await titles(p);
      return t.includes('Item 150') ? 'found' : undefined;
    });
    expect(hit).toBe('found');
    expect(visited).toEqual([
      '?__tipo=X',
      '?__tipo=X&fake_all_mr_=100&fake_all_p_=1',
      '?__tipo=X&fake_all_mr_=100&fake_all_p_=2',
    ]);
  });

  it('returns undefined after walking every page when the visitor never finds it', async () => {
    visited.length = 0;
    const hit = await visitListPages(LIST, go, async () => undefined);
    expect(hit).toBeUndefined();
    expect(visited).toEqual([
      '?__tipo=X',
      '?__tipo=X&fake_all_mr_=100&fake_all_p_=1',
      '?__tipo=X&fake_all_mr_=100&fake_all_p_=2',
      '?__tipo=X&fake_all_mr_=100&fake_all_p_=3',
    ]);
  });

  it('reads a one-page list once', async () => {
    visited.length = 0;
    const all = await collectListPages('https://scienti.minciencias.gov.co/cvlac/EnSmall/all.do', go, titles);
    expect(all).toEqual(['Item 1', 'Item 2', 'Item 3']);
    // Its status bar already says every row fits (to >= total): no paged
    // fetch should follow the plain one.
    expect(visited).toEqual(['']);
  });

  it('reads an empty list once and finds nothing', async () => {
    visited.length = 0;
    const all = await collectListPages('https://scienti.minciencias.gov.co/cvlac/EnEmpty/all.do', go, titles);
    expect(all).toEqual([]);
    expect(visited).toEqual(['']);
  });

  it('throws when the status bar reports missing rows but there is no table id', async () => {
    await expect(
      collectListPages('https://scienti.minciencias.gov.co/cvlac/EnBroken/all.do', go, titles)
    ).rejects.toThrow(IncompleteListError);
  });

  it('throws when the server ignores paging and the page never advances', async () => {
    await expect(
      collectListPages('https://scienti.minciencias.gov.co/cvlac/EnCapped/all.do', go, titles)
    ).rejects.toThrow(IncompleteListError);
  });

  it('throws when a paged page comes back with rows but no status bar', async () => {
    await expect(
      collectListPages('https://scienti.minciencias.gov.co/cvlac/EnNoStatus/all.do', go, titles)
    ).rejects.toThrow(IncompleteListError);
  });

  it('throws when consecutive paged pages skip rows instead of continuing where the last one stopped', async () => {
    await expect(
      collectListPages('https://scienti.minciencias.gov.co/cvlac/EnGap/all.do', go, titles)
    ).rejects.toThrow(IncompleteListError);
  });

  it('throws when pages keep advancing but never reach the total within the safety cap', async () => {
    // A server that only ever serves 50-row pages (ignoring the `_mr_=100` this
    // code requests) needs 7 contiguous pages to cover 350 rows, but the cap —
    // sized for MAX_ROWS-sized pages plus slack — only allows 6.
    await expect(
      collectListPages('https://scienti.minciencias.gov.co/cvlac/EnCap50/all.do', go, titles)
    ).rejects.toThrow(IncompleteListError);
  });
});
