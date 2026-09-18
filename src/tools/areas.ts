/**
 * Áreas de actuación: CvLAC's knowledge-area list.
 *
 * Not a picker and not a list page. `ReRecursoHumAreaCon/detail.do` holds one
 * `<select multiple>` used as an *ordered list* of the areas already chosen:
 * a popup appends options to it, two buttons move them up and down, and on
 * submit an inline `forma_onsubmit()` selects every option so they all post.
 * `save.do` then rewrites the whole set — same shape as the academic networks.
 *
 * Order is data: the first area is the main one.
 */

import type { Page } from 'playwright';

export interface Area {
  /** CvLAC's own code, e.g. `0-1B01`. */
  code: string;
  name: string;
}

/**
 * One option of the listbox, as `"<position>.<code>"` / `"<position>. <name>"`.
 *
 * The position is presentation, not identity: CvLAC's own remove and move
 * buttons renumber it. Only the code and the name are kept.
 */
export function parseAreaOption(value: string, label: string): Area | null {
  const rawValue = (value ?? '').trim();
  const rawLabel = (label ?? '').replace(/\s+/g, ' ').trim();
  if (!rawValue || !rawLabel) return null;

  return {
    code: rawValue.replace(/^\d+\./, ''),
    name: rawLabel.replace(/^\d+\.\s*/, ''),
  };
}

/** The options to put back, numbered from one — gaps are not left behind. */
export function formatAreaOptions(areas: Area[]): Array<{ value: string; label: string }> {
  return areas.map((area, index) => ({
    value: `${index + 1}.${area.code}`,
    label: `${index + 1}. ${area.name}`,
  }));
}

/** A row of one of the catalogue arrays: `[code, name, parent, …]`. */
export type AreaRow = Array<string | number | null>;

export interface CatalogueArea extends Area {
  /** The code of the area above it, or null at the top. */
  parent: string | null;
  /** 0 for a gran área, 3 for the finest. */
  level: number;
}

/**
 * The catalogue the popup page carries as `area_0`…`area_3`.
 *
 * It ships whole, in the page: the cascade is filled by JavaScript from those
 * arrays rather than by a request per level, so reading them once is the entire
 * catalogue.
 */
export function parseAreaCatalogue(levels: AreaRow[][]): CatalogueArea[] {
  const out: CatalogueArea[] = [];
  levels.forEach((rows, level) => {
    for (const row of rows ?? []) {
      const code = String(row?.[0] ?? '').trim();
      const name = String(row?.[1] ?? '').replace(/\s+/g, ' ').trim();
      if (!code || !name) continue;
      const parent = row?.[2] == null ? null : String(row[2]).trim() || null;
      out.push({ code, name, parent, level });
    }
  });
  return out;
}

/** The areas the listbox in front of us holds, in its own order. */
export async function readAreas(page: Page): Promise<Area[]> {
  const raw = await page.$$eval('select[name="cod_area_conocimiento"] option', (options) =>
    options.map((option) => ({
      value: (option as HTMLOptionElement).value,
      label: (option as HTMLOptionElement).text,
    }))
  );
  return raw.map((o) => parseAreaOption(o.value, o.label)).filter((a): a is Area => a !== null);
}

/**
 * Replaces the listbox with the given areas, every one of them selected.
 *
 * The selection is not cosmetic: a multi-select posts only what is selected, so
 * CvLAC's page runs an inline `forma_onsubmit()` that selects them all. This
 * writes the options directly and leaves them selected, so a submit carries the
 * list whether or not that handler ever runs.
 */
export async function applyAreas(page: Page, areas: Area[]): Promise<void> {
  await page.evaluate((options: Array<{ value: string; label: string }>) => {
    const select = document.querySelector<HTMLSelectElement>('select[name="cod_area_conocimiento"]');
    if (!select) return;
    select.innerHTML = '';
    for (const { value, label } of options) {
      const option = document.createElement('option');
      option.value = value;
      option.text = label;
      option.selected = true;
      select.add(option);
    }
  }, formatAreaOptions(areas));
}

/**
 * The catalogue, read out of the popup page's own globals.
 *
 * `areaAll.do` ships `area_0`…`area_3` inline and fills its cascade from them
 * in the browser, so nothing here needs a request per level.
 */
export async function readAreaCatalogue(page: Page): Promise<CatalogueArea[]> {
  const levels = await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    return [0, 1, 2, 3].map((level) => {
      const rows = win[`area_${level}`];
      return Array.isArray(rows) ? (rows as unknown[][]) : [];
    });
  });
  return parseAreaCatalogue(levels as AreaRow[][]);
}

/**
 * The areas a replacement list would drop, by name.
 *
 * The list is written whole because its order is data — the first area is the
 * main one — so a shorter list is a deletion, and deletions get confirmed
 * before they happen. Reordering removes nothing.
 */
export function areaRemovals(current: Area[], desired: Area[]): string[] {
  const kept = new Set(desired.map((a) => a.code));
  return current.filter((a) => !kept.has(a.code)).map((a) => a.name);
}
