import type { Page } from 'playwright';
import { session } from '../browser/session.js';
import { BASE_URL, SECTION_LIST } from '../browser/navigation.js';
import { navigate } from '../browser/navigate.js';
import { findRowActionHref } from './update-section.js';
import { createLogger } from '../logger.js';
import type { CvLACSectionName, CvLACDetail, CvLACDetailField } from '../types.js';

const log = createLogger('read-detail');

/**
 * Reads the label/value pairs of a CvLAC record page.
 *
 * Every section renders its detail differently, so this stays deliberately
 * generic: it pairs the cells of every table row instead of hard-coding field
 * names per section. A section whose layout it cannot pair still returns its
 * text, which is more useful than an empty object.
 */
export async function extractDetailFields(page: Page): Promise<CvLACDetailField[]> {
  return page.$$eval('table', (tables) => {
    const clean = (s: string | null | undefined): string =>
      (s ?? '').replace(/\s+/g, ' ').trim();

    /** A caption is a cell whose whole text is bold — how CvLAC marks them. */
    const isCaption = (cell: Element): boolean => {
      const bold = cell.querySelector('b, strong');
      if (!bold) return false;
      const text = clean(cell.textContent);
      return text.length > 0 && clean(bold.textContent) === text;
    };

    const ownCells = (row: Element): Element[] =>
      Array.from(row.children).filter((c) => c.tagName === 'TD' || c.tagName === 'TH');

    const out: Array<{ label: string; value: string }> = [];

    const add = (label: string, value: string): void => {
      // A caption is a short one, not a paragraph; this drops layout rows that
      // happen to hold two cells of prose.
      if (!label || label.length > 120 || !value) return;
      out.push({ label: label.replace(/\s*:\s*$/, ''), value });
    };

    for (const table of tables) {
      // Only the rows this table owns: a nested table's rows belong to it, and
      // are visited when the loop reaches that table.
      const rows = Array.from(table.querySelectorAll(':scope > tr, :scope > tbody > tr'));

      for (let r = 0; r < rows.length; r++) {
        const cells = ownCells(rows[r]);
        if (cells.length === 0) continue;

        const captions = cells.filter(isCaption);

        // Layout A — a row of captions, their values on the row below. Used by
        // cursos, software and eventos, including for a caption that takes up
        // the whole row on its own.
        if (captions.length === cells.length) {
          const below = rows[r + 1] ? ownCells(rows[r + 1]) : [];
          if (below.length === cells.length && below.every((c) => !isCaption(c))) {
            for (let i = 0; i < cells.length; i++) {
              add(clean(cells[i].textContent), clean(below[i].textContent));
            }
            r++; // that row was the values; do not read it again
          }
          continue;
        }

        // Layout B — caption and value side by side on the same row. Used by
        // reconocimientos, experiencia and formación.
        if (cells.length >= 2 && cells.length % 2 === 0) {
          for (let i = 0; i < cells.length; i += 2) {
            add(clean(cells[i].textContent), clean(cells[i + 1].textContent));
          }
        }
      }
    }
    return out;
  });
}

/** The record page's own text, for sections whose layout has no pairable rows. */
async function readDetailText(page: Page): Promise<string> {
  const text = await page.evaluate(() => (document.body.textContent ?? '').replace(/\s+/g, ' ').trim());
  return text.slice(0, 4000);
}

export async function readCvlacDetailTool(
  section: CvLACSectionName,
  label: string
): Promise<CvLACDetail> {
  const cfg = SECTION_LIST[section];
  if (!cfg) {
    return { section, label, found: false, fields: [], message: `Section "${section}" not supported` };
  }

  await session.login();
  const page = await session.getPage();
  try {
    await navigate(page, cfg.listUrl);

    const href = await findRowActionHref(page, cfg.matchCellIndex, label, 'Detalles');
    if (!href) {
      log.info('no row matched', { section, label });
      return {
        section,
        label,
        found: false,
        fields: [],
        message: `No item matching "${label}" in ${section}`,
      };
    }

    const url = href.startsWith('http') ? href : BASE_URL + href;
    await navigate(page, url);

    const fields = await extractDetailFields(page);
    log.info('detail read', { section, label, fields: fields.length });
    return {
      section,
      label,
      found: true,
      url,
      fields,
      // Only when pairing found nothing: otherwise this doubles the payload of
      // every successful read for no gain.
      text: fields.length === 0 ? await readDetailText(page) : undefined,
    };
  } finally {
    await page.close();
  }
}
