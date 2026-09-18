import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  parseAreaOption,
  formatAreaOptions,
  parseAreaCatalogue,
  readAreas,
  applyAreas,
  readAreaCatalogue,
  areaRemovals,
  type AreaRow,
} from '../src/tools/areas.js';

// The listbox is an ordered list, not a picker: each option's value is its
// position, a dot and the area's code, and its label repeats the position.
describe('parseAreaOption', () => {
  it('separates the position from the code and the name', () => {
    expect(parseAreaOption('1.0-1B01', '1. Ciencias de la Computación')).toEqual({
      code: '0-1B01',
      name: 'Ciencias de la Computación',
    });
  });

  it('reads a position beyond the first', () => {
    expect(parseAreaOption('12.0-2B', '12. Ingenierías Eléctrica y Electrónica')).toEqual({
      code: '0-2B',
      name: 'Ingenierías Eléctrica y Electrónica',
    });
  });

  it('takes an option with no position as the code itself', () => {
    expect(parseAreaOption('0-1B01', 'Ciencias de la Computación')).toEqual({
      code: '0-1B01',
      name: 'Ciencias de la Computación',
    });
  });

  it('ignores an empty option', () => {
    expect(parseAreaOption('', '')).toBeNull();
  });
});

describe('formatAreaOptions', () => {
  const areas = [
    { code: '0-1B01', name: 'Ciencias de la Computación' },
    { code: '0-2B', name: 'Ingenierías Eléctrica, Electrónica e Informática' },
  ];

  it('numbers the options from one, in order', () => {
    expect(formatAreaOptions(areas)).toEqual([
      { value: '1.0-1B01', label: '1. Ciencias de la Computación' },
      { value: '2.0-2B', label: '2. Ingenierías Eléctrica, Electrónica e Informática' },
    ]);
  });

  // Order is what CvLAC stores: the first area is the main one. Removing one
  // renumbers the rest, which is what its own buttons do.
  it('renumbers after a removal instead of leaving a gap', () => {
    expect(formatAreaOptions([areas[1]])).toEqual([
      { value: '1.0-2B', label: '1. Ingenierías Eléctrica, Electrónica e Informática' },
    ]);
  });

  it('handles an empty list', () => {
    expect(formatAreaOptions([])).toEqual([]);
  });
});

// The whole catalogue ships inside the popup page as four JS arrays, one per
// level: [code, name, parentCode, …].
describe('parseAreaCatalogue', () => {
  const raw: AreaRow[][] = [
    [['0-1', 'Ciencias Naturales', null, '', 0, 0]],
    [
      ['0-1B', 'Computación y Ciencias de la Información', '0-1', '', 0, 0],
      ['0-2B', 'Ingenierías Eléctrica, Electrónica e Informática', '0-2', '', 0, 0],
    ],
    [['0-1B01', 'Ciencias de la Computación', '0-1B', '', 0, 0]],
    [],
  ];

  it('flattens the levels, keeping the parent and the depth of each area', () => {
    const catalogue = parseAreaCatalogue(raw);
    expect(catalogue).toHaveLength(4);
    expect(catalogue.find((a) => a.code === '0-1B01')).toEqual({
      code: '0-1B01',
      name: 'Ciencias de la Computación',
      parent: '0-1B',
      level: 2,
    });
  });

  it('leaves a top-level area without a parent', () => {
    expect(parseAreaCatalogue(raw).find((a) => a.code === '0-1')?.parent).toBeNull();
  });

  it('drops rows with no code or no name', () => {
    expect(parseAreaCatalogue([[['', 'Sin código', null, '', 0, 0]], [], [], []])).toEqual([]);
  });
});

describe('readAreas / applyAreas / readAreaCatalogue', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
  }, 60000);

  afterAll(async () => {
    await browser?.close();
  });

  const FIXTURE = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cvlac', 'areas-detail.html'),
    'utf8'
  );

  const optionsOf = (): Promise<Array<{ value: string; selected: boolean }>> =>
    page.$$eval('#lista_sectores option', (os) =>
      os.map((o) => ({ value: (o as HTMLOptionElement).value, selected: (o as HTMLOptionElement).selected }))
    );

  it('reads the areas the profile already holds, in order', async () => {
    await page.setContent(FIXTURE);
    expect(await readAreas(page)).toEqual([
      { code: '0-1B01', name: 'Ciencias de la Computación' },
      { code: '0-2B', name: 'Ingenierías Eléctrica, Electrónica e Informática' },
    ]);
  });

  it('writes the whole list back, renumbered', async () => {
    await page.setContent(FIXTURE);
    await applyAreas(page, [
      { code: '0-2B', name: 'Ingenierías Eléctrica, Electrónica e Informática' },
      { code: '0-1B01', name: 'Ciencias de la Computación' },
    ]);
    expect((await optionsOf()).map((o) => o.value)).toEqual(['1.0-2B', '2.0-1B01']);
  });

  // save.do keeps what the form posts, and a multi-select posts only what is
  // selected. CvLAC's own page selects them all in an inline handler before
  // submitting; leaving that to a handler this filler does not run would have
  // stored an empty list.
  it('leaves every option selected, which is what makes them post', async () => {
    await page.setContent(FIXTURE);
    await applyAreas(page, [{ code: '0-1B01', name: 'Ciencias de la Computación' }]);
    expect((await optionsOf()).every((o) => o.selected)).toBe(true);
  });

  it('can empty the list', async () => {
    await page.setContent(FIXTURE);
    await applyAreas(page, []);
    expect(await optionsOf()).toEqual([]);
  });

  // The popup page carries the catalogue as four globals rather than fetching a
  // level at a time, so one page load is the whole thing.
  it('reads the catalogue out of the popup page globals', async () => {
    await page.setContent(`<script>
      var area_0 = [ ['0-1','Ciencias Naturales',null,'',0,0] ];
      var area_1 = [ ['0-1B','Computación y Ciencias de la Información','0-1','',0,0] ];
      var area_2 = [ ['0-1B01','Ciencias de la Computación','0-1B','',0,0] ];
      var area_3 = [];
    </script>`);
    const catalogue = await readAreaCatalogue(page);
    expect(catalogue).toHaveLength(3);
    expect(catalogue.find((a) => a.code === '0-1B01')?.parent).toBe('0-1B');
  });

  // On its own page: `setContent` replaces the document but not the window, so
  // the globals the previous test declared would still be there.
  it('reports an empty catalogue rather than throwing when the page has none', async () => {
    const blank = await browser.newPage();
    try {
      await blank.setContent('<p>sin catálogo</p>');
      expect(await readAreaCatalogue(blank)).toEqual([]);
    } finally {
      await blank.close();
    }
  });
});

// Order is data — the first area is the main one — so the list is replaced
// whole rather than merged. Which means a shorter list is a deletion, and
// deletions are confirmed before they happen.
describe('areaRemovals', () => {
  const computacion = { code: '0-1B01', name: 'Ciencias de la Computación' };
  const ingenieria = { code: '0-2B', name: 'Ingenierías Eléctrica y Electrónica' };

  it('names the areas a new list would drop', () => {
    expect(areaRemovals([computacion, ingenieria], [computacion])).toEqual([
      'Ingenierías Eléctrica y Electrónica',
    ]);
  });

  it('reports none when the list only grows', () => {
    expect(areaRemovals([computacion], [computacion, ingenieria])).toEqual([]);
  });

  it('does not count a reorder as a deletion', () => {
    expect(areaRemovals([computacion, ingenieria], [ingenieria, computacion])).toEqual([]);
  });

  it('reports every area when the list is emptied', () => {
    expect(areaRemovals([computacion, ingenieria], [])).toHaveLength(2);
  });
});
