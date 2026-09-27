import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { parseStatusBar, pagedListUrl, MAX_ROWS, collectListPages, visitListPages } from '../src/browser/jmesa.js';

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
    const all = await collectListPages(page, LIST, go, titles);
    expect(all).toHaveLength(212);
    expect(all[0]).toBe('Item 1');
    expect(all[211]).toBe('Item 212');
    // First the plain list, then three pages of 100.
    expect(visited).toHaveLength(4);
    expect(visited.every((s, i) => i === 0 || s.includes('__tipo=X'))).toBe(true);
  });

  it('stops at the page where the visitor finds what it wants', async () => {
    visited.length = 0;
    const hit = await visitListPages(page, LIST, go, async (p) => {
      const t = await titles(p);
      return t.includes('Item 150') ? 'found' : undefined;
    });
    expect(hit).toBe('found');
    expect(visited).toHaveLength(3); // plain list, page 1, page 2
  });

  it('reads a one-page list once', async () => {
    await page.route('https://scienti.minciencias.gov.co/cvlac/EnSmall/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: listHtml(1, 3, 3) })
    );
    const all = await collectListPages(page, 'https://scienti.minciencias.gov.co/cvlac/EnSmall/all.do', go, titles);
    expect(all).toEqual(['Item 1', 'Item 2', 'Item 3']);
  });
});
