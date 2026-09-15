import type { Page } from 'playwright';
import { session } from '../browser/session.js';
import { BASE_URL, SECTION_LIST } from '../browser/navigation.js';
import { assertAvailable } from '../browser/availability.js';
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
  return page.$$eval('table tr', (rows) => {
    const clean = (s: string | null | undefined): string =>
      (s ?? '').replace(/\s+/g, ' ').trim();

    const out: Array<{ label: string; value: string }> = [];
    for (const row of rows) {
      // Nested tables would report the outer row's cells too; only take the
      // cells this row owns.
      const cells = Array.from(row.children).filter((c) => c.tagName === 'TD' || c.tagName === 'TH');
      if (cells.length < 2 || cells.length % 2 !== 0) continue;
      for (let i = 0; i < cells.length; i += 2) {
        const label = clean(cells[i].textContent);
        const value = clean(cells[i + 1].textContent);
        // A label is a short caption, not a paragraph; this drops layout rows
        // that happen to hold two cells of prose.
        if (!label || label.length > 120) continue;
        if (!value) continue;
        out.push({ label: label.replace(/\s*:\s*$/, ''), value });
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
    const listResponse = await page.goto(cfg.listUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    assertAvailable(listResponse?.status() ?? null, cfg.listUrl);

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
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    assertAvailable(response?.status() ?? null, url);

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
