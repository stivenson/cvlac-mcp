import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  NETWORK_SLOTS,
  resolveNetwork,
  networkNames,
  parseRedes,
  normalizeNetworkUrl,
  mergeRedes,
  readRedesState,
  applyRedesState,
  checkDescription,
  deletionsIn,
  restorePoint,
} from '../src/tools/profile.js';

// What `readFormValues` returns for ReRedSocialIdent/create.do: an unchecked
// checkbox is absent, a checked one reads 'on', and every URL_n is present.
const emptyForm = (): Record<string, string> => {
  const out: Record<string, string> = { cod_rh: '0001402041', txt_otro: '' };
  for (let n = 1; n <= 13; n++) out[`URL_${n}`] = '';
  return out;
};

describe('NETWORK_SLOTS', () => {
  it('covers the thirteen rows CvLAC renders', () => {
    expect(NETWORK_SLOTS).toHaveLength(13);
    expect(NETWORK_SLOTS.map((s) => s.slot)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13]);
  });

  // CvLAC splits "Social Sciences Research Network (SSRN)" across two rows, each
  // with its own checkbox and URL. They are two slots, not one.
  it('keeps the split SSRN rows as two separate slots', () => {
    expect(NETWORK_SLOTS[2].label).toBe('Social Sciences Research');
    expect(NETWORK_SLOTS[3].label).toBe('Network (SSRN)');
  });
});

describe('resolveNetwork', () => {
  it('matches the canonical key', () => {
    expect(resolveNetwork('orcid')?.slot).toBe(12);
  });

  it('matches the label CvLAC prints', () => {
    expect(resolveNetwork('Google Scholar')?.slot).toBe(1);
  });

  // CvLAC spells it "Linkedln", with an l. Nobody will type that.
  it('finds LinkedIn despite CvLAC misspelling it', () => {
    expect(resolveNetwork('LinkedIn')?.slot).toBe(7);
  });

  it('ignores case and accents', () => {
    expect(resolveNetwork('RESEARCHGATE')?.slot).toBe(2);
  });

  it('routes an unlisted network to the "Otro" row', () => {
    expect(resolveNetwork('otro')?.slot).toBe(13);
  });

  it('refuses a name it does not know rather than guessing a row', () => {
    expect(resolveNetwork('GitHub')).toBeNull();
  });
});

describe('networkNames', () => {
  it('lists the accepted names, so a rejection can say what to use', () => {
    expect(networkNames()).toContain('orcid');
    expect(networkNames()).toContain('linkedin');
  });
});

describe('parseRedes', () => {
  it('reports nothing when the profile has no network stored', () => {
    expect(parseRedes(emptyForm())).toEqual([]);
  });

  it('reads a stored network with its canonical name', () => {
    const fields = { ...emptyForm(), URL_12: 'https://orcid.org/0000-0002-1825-0097', CHECK_12: 'on' };
    expect(parseRedes(fields)).toEqual([
      {
        slot: 12,
        key: 'orcid',
        label: 'Open Researcher and Contributor ID (ORCID)',
        url: 'https://orcid.org/0000-0002-1825-0097',
      },
    ]);
  });

  // The "Otro" row carries its own name in txt_otro; without it the entry reads
  // as "Otro", which says nothing.
  it('names the "Otro" row with the label CvLAC stored beside it', () => {
    const fields = { ...emptyForm(), URL_13: 'https://github.com/someone', CHECK_13: 'on', txt_otro: 'GitHub' };
    expect(parseRedes(fields)[0]).toMatchObject({ slot: 13, key: 'otro', label: 'GitHub' });
  });

  // A row ticked with an empty URL stores nothing; reporting it as a network
  // would invent one.
  it('ignores a row ticked with no URL', () => {
    expect(parseRedes({ ...emptyForm(), CHECK_5: 'on' })).toEqual([]);
  });
});

// The form validates with jQuery's `url` rule, which demands a scheme.
describe('normalizeNetworkUrl', () => {
  it('keeps a url that already carries its scheme', () => {
    expect(normalizeNetworkUrl('https://orcid.org/0000-0002-1825-0097')).toBe(
      'https://orcid.org/0000-0002-1825-0097'
    );
  });

  it('adds https to a bare host, which the form would reject', () => {
    expect(normalizeNetworkUrl('linkedin.com/in/someone')).toBe('https://linkedin.com/in/someone');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeNetworkUrl('  https://example.org/x  ')).toBe('https://example.org/x');
  });

  it('refuses text that is not a url', () => {
    expect(normalizeNetworkUrl('mi perfil de orcid')).toBeNull();
    expect(normalizeNetworkUrl('')).toBeNull();
  });
});

describe('mergeRedes', () => {
  const stored = [
    { slot: 12, key: 'orcid', label: 'Open Researcher and Contributor ID (ORCID)', url: 'https://orcid.org/x' },
  ];

  // insert.do rewrites the whole set from what the form posts. Submitting only
  // the new network would delete every other one.
  it('carries the already stored networks through untouched', () => {
    const state = mergeRedes(stored, [{ network: 'linkedin', url: 'https://linkedin.com/in/someone' }]);
    expect(state.urls.URL_12).toBe('https://orcid.org/x');
    expect(state.checked).toContain('CHECK_12');
  });

  it('sets the new network and ticks its box', () => {
    const state = mergeRedes(stored, [{ network: 'linkedin', url: 'https://linkedin.com/in/someone' }]);
    expect(state.urls.URL_7).toBe('https://linkedin.com/in/someone');
    expect(state.checked).toContain('CHECK_7');
  });

  it('leaves every untouched row empty and unticked', () => {
    const state = mergeRedes(stored, []);
    expect(state.urls.URL_1).toBe('');
    expect(state.checked).not.toContain('CHECK_1');
  });

  it('fills all thirteen url fields, since the form posts all of them', () => {
    const state = mergeRedes(stored, []);
    expect(Object.keys(state.urls)).toHaveLength(13);
  });

  it('removes a network when the change clears its url', () => {
    const state = mergeRedes(stored, [{ network: 'orcid', url: null }]);
    expect(state.urls.URL_12).toBe('');
    expect(state.checked).not.toContain('CHECK_12');
  });

  it('writes the name of an "Otro" network into txt_otro', () => {
    const state = mergeRedes([], [{ network: 'otro', url: 'https://github.com/someone', label: 'GitHub' }]);
    expect(state.urls.URL_13).toBe('https://github.com/someone');
    expect(state.otroLabel).toBe('GitHub');
  });

  it('normalises the url it is given', () => {
    const state = mergeRedes([], [{ network: 'orcid', url: 'orcid.org/0000' }]);
    expect(state.urls.URL_12).toBe('https://orcid.org/0000');
  });

  it('refuses a network it cannot place', () => {
    expect(() => mergeRedes([], [{ network: 'GitHub', url: 'https://github.com/x' }])).toThrow(
      /GitHub/
    );
  });

  it('refuses a url it cannot make valid', () => {
    expect(() => mergeRedes([], [{ network: 'orcid', url: 'mi perfil' }])).toThrow(/mi perfil/);
  });
});

// ── The page side ────────────────────────────────────────────────────────────

describe('readRedesState / applyRedesState', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
  }, 60000);

  afterAll(async () => {
    await browser?.close();
  });

  const fixture = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cvlac', 'redes-sociales.html'),
    'utf8'
  );

  const valueOf = (name: string): Promise<string> =>
    page.$eval(`[name="${name}"]`, (el) => (el as HTMLInputElement).value);
  const isChecked = (name: string): Promise<boolean> =>
    page.$eval(`[name="${name}"]`, (el) => (el as HTMLInputElement).checked);

  it('reads the networks the page already holds', async () => {
    await page.setContent(fixture);
    expect(await readRedesState(page)).toEqual([
      {
        slot: 12,
        key: 'orcid',
        label: 'Open Researcher and Contributor ID (ORCID)',
        url: 'https://orcid.org/0000-0002-1825-0097',
      },
    ]);
  });

  it('writes a url and ticks its row', async () => {
    await page.setContent(fixture);
    const stored = await readRedesState(page);
    await applyRedesState(page, mergeRedes(stored, [{ network: 'linkedin', url: 'https://linkedin.com/in/someone' }]));
    expect(await valueOf('URL_7')).toBe('https://linkedin.com/in/someone');
    expect(await isChecked('CHECK_7')).toBe(true);
  });

  it('leaves the networks already stored in place', async () => {
    await page.setContent(fixture);
    const stored = await readRedesState(page);
    await applyRedesState(page, mergeRedes(stored, [{ network: 'linkedin', url: 'https://linkedin.com/in/someone' }]));
    expect(await valueOf('URL_12')).toBe('https://orcid.org/0000-0002-1825-0097');
    expect(await isChecked('CHECK_12')).toBe(true);
  });

  it('unticks the row of a network it clears', async () => {
    await page.setContent(fixture);
    const stored = await readRedesState(page);
    await applyRedesState(page, mergeRedes(stored, [{ network: 'orcid', url: null }]));
    expect(await valueOf('URL_12')).toBe('');
    expect(await isChecked('CHECK_12')).toBe(false);
  });

  // The name of an "Otro" network lives in a box CvLAC keeps hidden until its
  // checkbox is clicked, so it cannot be typed into — it has to be set.
  it('names an "Otro" network in the box the page keeps hidden', async () => {
    await page.setContent(fixture);
    const stored = await readRedesState(page);
    await applyRedesState(
      page,
      mergeRedes(stored, [{ network: 'otro', url: 'https://github.com/someone', label: 'GitHub' }])
    );
    expect(await valueOf('URL_13')).toBe('https://github.com/someone');
    expect(await valueOf('txt_otro')).toBe('GitHub');
    expect(await isChecked('CHECK_13')).toBe(true);
  });

  // The real page wires jQuery handlers to every checkbox. Clicking would run
  // them; this fills without them, so a page whose scripts failed still writes.
  it('does not depend on the page own handlers', async () => {
    await page.setContent(fixture);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await applyRedesState(page, mergeRedes([], [{ network: 'google_scholar', url: 'https://scholar.google.com/x' }]));
    expect(errors).toEqual([]);
    expect(await isChecked('CHECK_1')).toBe(true);
  });
});

// CvLAC marks txt_desc_perfil `required`: a submit with it empty bounces, and
// the bounce came back carrying the stored text, which read as a rejection
// naming the very text it had refused to erase.
describe('checkDescription', () => {
  it('refuses an empty profile text, which CvLAC will not store', () => {
    expect(checkDescription('')).toMatch(/vac|empty|required/i);
    expect(checkDescription('   ')).toBeTruthy();
  });

  it('accepts any text with content', () => {
    expect(checkDescription('Ingeniero de Sistemas.')).toBeNull();
  });

  it('refuses text longer than the field holds', () => {
    expect(checkDescription('x'.repeat(4000))).toMatch(/3950|largo|long/i);
  });
});

describe('deletionsIn', () => {
  it('names the networks a change would remove', () => {
    expect(deletionsIn([{ network: 'orcid', url: null }, { network: 'linkedin', url: 'https://x.co' }])).toEqual([
      'orcid',
    ]);
  });

  it('treats an empty url as a removal too', () => {
    expect(deletionsIn([{ network: 'orcid', url: '' }])).toEqual(['orcid']);
  });

  it('reports nothing when the change only writes', () => {
    expect(deletionsIn([{ network: 'orcid', url: 'https://orcid.org/x' }])).toEqual([]);
  });
});

// A run that could not clean up leaves its test data behind. The next run read
// that as the account's real state and faithfully put it back.
describe('restorePoint', () => {
  const TAG = 'ZZ PRUEBA MCP';
  const real = { slot: 12, key: 'orcid', label: 'ORCID', url: 'https://orcid.org/real' };
  const junk = { slot: 2, key: 'researchgate', label: 'ResearchGate', url: 'https://example.org/zz-prueba-mcp' };

  it('restores what the account really had', () => {
    const point = restorePoint({ description: 'Perfil real.', networks: [real] }, TAG);
    expect(point.description).toBe('Perfil real.');
    expect(point.networks).toEqual([real]);
    expect(point.leftovers).toEqual([]);
  });

  it('does not restore a profile text left behind by an earlier run', () => {
    const point = restorePoint({ description: `${TAG} — texto de prueba.`, networks: [] }, TAG);
    expect(point.description).toBeNull();
    expect(point.leftovers).toContain('texto de perfil');
  });

  it('does not restore a network left behind by an earlier run', () => {
    const point = restorePoint({ description: 'Perfil real.', networks: [real, junk] }, TAG);
    expect(point.networks).toEqual([real]);
    expect(point.leftovers).toContain('researchgate');
  });

  // CvLAC refuses an empty profile text, so there is no way back to "empty".
  it('has nothing to restore when the profile text was empty', () => {
    expect(restorePoint({ description: '', networks: [] }, TAG).description).toBeNull();
  });
});
