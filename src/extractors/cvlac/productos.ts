import type { Page } from 'playwright';
import { collectListPages } from '../../browser/jmesa.js';
import { navigate } from '../../browser/navigate.js';
import { URLS } from '../../browser/navigation.js';
import { createLogger } from '../../logger.js';
import type { CvLACArticuloItem, CvLACCapituloItem, CvLACJuradoItem, CvLACLibroItem, CvLACTesisItem, CvLACTecnicaItem } from '../../types.js';

const log = createLogger('extract');

export const headerKey = (text: string): string =>
  (text ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();

const ACTIONS = new Set(['detalles', 'editar', 'eliminar', '']);

/** Read product rows by header text, so column order changes do not corrupt fields. */
export async function readRowsByHeader(page: Page): Promise<Array<Record<string, string>>> {
  const raw = await page.evaluate(() => {
    const clean = (value: string | null): string => (value ?? '').replace(/\s+/g, ' ').trim();
    const candidates = Array.from(document.querySelectorAll('table.table thead tr, table.table tr.header, table.table tr'));
    const headerRow = candidates.find((row) => {
      const text = clean(row.textContent);
      const cells = row.querySelectorAll('th, td').length;
      return cells >= 2 && /t[ií]tulo|nombre|a[nñ]o|categor[ií]a|informe|consultor[ií]a|producto|prototipo/i.test(text);
    }) ?? null;
    const headers = headerRow
      ? Array.from(headerRow.querySelectorAll('th, td')).map((cell) => clean(cell.textContent))
      : [];
    const rows = Array.from(document.querySelectorAll('tr.odd, tr.even')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => clean(cell.textContent))
    );
    return { headers, rows };
  });

  const keys = raw.headers.map(headerKey);
  return raw.rows
    .filter((cells) => cells.length >= 2)
    .map((cells) => {
      const record: Record<string, string> = {};
      keys.forEach((key, index) => {
        if (!ACTIONS.has(key)) record[key] = cells[index] ?? '';
      });
      return record;
    });
}

export async function extractProductList<T>(
  page: Page,
  section: string,
  url: string,
  required: string[],
  map: (row: Record<string, string>) => T | null
): Promise<T[]> {
  const rows = await collectListPages(
    url,
    async (target) => {
      await navigate(page, target);
      return page;
    },
    (current) => readRowsByHeader(current)
  );
  if (rows.length > 0) {
    const missing = required.filter((key) => !(key in rows[0]));
    if (missing.length) log.warn('list lost columns; CvLAC may have changed it', { section, missing });
  }
  return rows.map(map).filter((item): item is T => item !== null);
}

export async function extractArticulos(page: Page): Promise<CvLACArticuloItem[]> {
  return extractProductList(page, 'articulos', URLS.articulos, ['titulo del articulo', 'ano'], (row) => {
    const title = row.titulo ?? row['titulo del articulo'] ?? row.nombre ?? '';
    return title ? { title, year: row.ano ?? row['ano de publicacion'] ?? '', revista: row.revista ?? row['nombre de la revista'] ?? '' } : null;
  });
}

const titleOf = (row: Record<string, string>): string => {
  const direct = row.titulo ?? row['titulo del trabajo'] ?? row.nombre ?? row['nombre del producto'];
  if (direct) return direct;
  return Object.entries(row).find(([key, value]) => /^(titulo|nombre|informe|consultoria|producto|prototipo)(\s|$)/.test(key) && value)?.[1] ?? '';
};

export async function extractJurados(page: Page): Promise<CvLACJuradoItem[]> {
  return extractProductList(page, 'jurados', URLS.jurados, ['titulo'], (row) => {
    const title = titleOf(row);
    return title ? { title, year: row.ano ?? '' } : null;
  });
}

export async function extractTesis(page: Page): Promise<CvLACTesisItem[]> {
  return extractProductList(page, 'tesis', URLS.tesis, ['titulo'], (row) => {
    const title = titleOf(row);
    return title ? { title, year: row.ano ?? '' } : null;
  });
}

export async function extractCapitulos(page: Page): Promise<CvLACCapituloItem[]> {
  return extractProductList(page, 'capitulos', URLS.capitulos, ['titulo del capitulo', 'ano', 'titulo del libro'], (row) =>
    row['titulo del capitulo'] ? { title: row['titulo del capitulo'], year: row.ano ?? '', book: row['titulo del libro'] ?? '' } : null
  );
}

export async function extractLibros(page: Page): Promise<CvLACLibroItem[]> {
  return extractProductList(page, 'libros', URLS.libros, ['ano'], (row) => {
    const title = row.titulo ?? row['titulo del libro'] ?? row.nombre ?? '';
    return title ? { title, year: row.ano ?? '' } : null;
  });
}

export async function extractTecnica(page: Page, section: string, url: string): Promise<CvLACTecnicaItem[]> {
  return extractProductList(page, section, url, [], (row) => {
    const title = titleOf(row);
    return title ? { title, year: row.ano ?? '' } : null;
  });
}
