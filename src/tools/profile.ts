/**
 * The two CvLAC pages that hold one record instead of a list: the researcher's
 * profile text and the table of academic social networks.
 *
 * Neither has an `all.do`, so neither fits `update_section`'s add/update/delete.
 * The network table matters most: `ReRedSocialIdent/insert.do` rewrites the whole
 * set from what the form posts, so adding one network by submitting only that
 * one would delete every other. Every write here is a merge over what is stored.
 */

import type { Page } from 'playwright';
import { session } from '../browser/session.js';
import { navigate } from '../browser/navigate.js';
import { URLS } from '../browser/navigation.js';
import { createLogger } from '../logger.js';
import { readFormValues, readFormErrors, clickGuardar, landedOnOutage } from './update-section.js';
import { deleteConfirmation, choiceConfirmation } from './write-verdict.js';
import { resolveChoice } from '../browser/catalogue.js';
import { readAreas, applyAreas, readAreaCatalogue, areaRemovals, type Area } from './areas.js';
import type { UpdateResult, UpdateStatus } from '../types.js';

const log = createLogger('profile');

export interface NetworkSlot {
  /** Which row of the table, 1-13. The field names carry this number. */
  slot: number;
  /** What this server accepts as a name for it. */
  key: string;
  /** What CvLAC prints in the first column, typos and all. */
  label: string;
  /** Other spellings a caller may reasonably use. */
  aliases?: string[];
}

/**
 * The thirteen rows, in CvLAC's own order.
 *
 * Two of them are one network: CvLAC's JSP splits "Social Sciences Research
 * Network (SSRN)" across two rows, each with its own checkbox and URL field.
 * They are kept apart because the form keeps them apart.
 */
export const NETWORK_SLOTS: NetworkSlot[] = [
  { slot: 1, key: 'google_scholar', label: 'Google Scholar', aliases: ['scholar', 'google academico'] },
  { slot: 2, key: 'researchgate', label: 'ResearchGate' },
  { slot: 3, key: 'ssr', label: 'Social Sciences Research' },
  { slot: 4, key: 'ssrn', label: 'Network (SSRN)' },
  { slot: 5, key: 'academia_edu', label: 'Academia.edu', aliases: ['academia'] },
  { slot: 6, key: 'mendeley', label: 'Mendeley (Elservier - Scopus)' },
  // CvLAC writes it "Linkedln", with an l where the i goes. Nobody will type that.
  { slot: 7, key: 'linkedin', label: 'Linkedln', aliases: ['linked in'] },
  {
    slot: 8,
    key: 'repositorios_disciplinares',
    label: 'Repositorios disciplinares (Directorio Exit, eLIS, etc.)',
  },
  { slot: 9, key: 'repositorios_institucionales', label: 'Repositorios institucionales' },
  { slot: 10, key: 'researcher_id', label: 'ResearcherID (Thomson Reuters - WOS)', aliases: ['researcherid', 'wos'] },
  { slot: 11, key: 'scopus_author_id', label: 'Autor ID (Scopus)', aliases: ['scopus', 'author id'] },
  { slot: 12, key: 'orcid', label: 'Open Researcher and Contributor ID (ORCID)' },
  // The catch-all row: its name is typed by hand into `txt_otro`.
  { slot: 13, key: 'otro', label: 'Otro', aliases: ['other'] },
];

const norm = (s: string): string =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** The slot a caller means, or null rather than a guess at someone's profile. */
export function resolveNetwork(name: string): NetworkSlot | null {
  const wanted = norm(name);
  if (!wanted) return null;
  return (
    NETWORK_SLOTS.find((s) =>
      [s.key, s.label, ...(s.aliases ?? [])].some((candidate) => norm(candidate) === wanted)
    ) ?? null
  );
}

/** Every name this server accepts, so a rejection can say what to use instead. */
export function networkNames(): string[] {
  return NETWORK_SLOTS.map((s) => s.key);
}

export interface StoredNetwork {
  slot: number;
  key: string;
  /** The network's name: CvLAC's caption, or what `txt_otro` holds for row 13. */
  label: string;
  url: string;
}

/**
 * The networks a profile actually holds, read off the form's own fields.
 *
 * A row ticked with an empty URL stores nothing, so it is not a network.
 */
export function parseRedes(fields: Record<string, string>): StoredNetwork[] {
  const out: StoredNetwork[] = [];
  for (const slot of NETWORK_SLOTS) {
    const url = (fields[`URL_${slot.slot}`] ?? '').trim();
    if (!url) continue;
    const otro = (fields.txt_otro ?? '').trim();
    out.push({
      slot: slot.slot,
      key: slot.key,
      label: slot.slot === 13 && otro ? otro : slot.label,
      url,
    });
  }
  return out;
}

/**
 * A URL the form will accept.
 *
 * The page validates with jQuery's `url` rule, which demands a scheme: a bare
 * host is refused. A host without one is completed rather than rejected, but
 * text that is not an address at all returns null — guessing an URL into an
 * official record is worse than refusing.
 */
export function normalizeNetworkUrl(url: string | null | undefined): string | null {
  const text = (url ?? '').trim();
  if (!text) return null;

  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  if (!/^https?:\/\/[^\s/]+\.[a-z]{2,}(?:[:/?#]|$)/i.test(withScheme)) return null;
  try {
    new URL(withScheme);
  } catch {
    return null;
  }
  return withScheme;
}

export interface NetworkChange {
  /** A key, alias or CvLAC label; `null` url removes the network. */
  network: string;
  url: string | null;
  /** Only for the "Otro" row: the name CvLAC stores beside the URL. */
  label?: string;
}

/** The whole desired state of the table, which is what the form has to post. */
export interface RedesFormState {
  /** `URL_1`…`URL_13`, empty for every row that holds nothing. */
  urls: Record<string, string>;
  /** The `CHECK_n` boxes to tick — only rows that carry a URL. */
  checked: string[];
  /** What goes in `txt_otro`. */
  otroLabel: string;
}

export function mergeRedes(stored: StoredNetwork[], changes: NetworkChange[]): RedesFormState {
  const desired = new Map<number, string>();
  let otroLabel = '';
  for (const s of stored) {
    desired.set(s.slot, s.url);
    if (s.slot === 13) otroLabel = s.label;
  }

  for (const change of changes) {
    const slot = resolveNetwork(change.network);
    if (!slot) {
      throw new Error(
        `Unknown academic network "${change.network}". Use one of: ${networkNames().join(', ')} ` +
          `— anything CvLAC does not list goes in "otro", with its name in "label".`
      );
    }
    if (change.url === null || (change.url ?? '').trim() === '') {
      desired.delete(slot.slot);
      if (slot.slot === 13) otroLabel = '';
      continue;
    }
    const url = normalizeNetworkUrl(change.url);
    if (!url) {
      throw new Error(`"${change.url}" is not a URL, and CvLAC's form rejects anything that is not one.`);
    }
    desired.set(slot.slot, url);
    if (slot.slot === 13 && change.label) otroLabel = change.label;
  }

  const urls: Record<string, string> = {};
  const checked: string[] = [];
  for (const slot of NETWORK_SLOTS) {
    const url = desired.get(slot.slot) ?? '';
    urls[`URL_${slot.slot}`] = url;
    if (url) checked.push(`CHECK_${slot.slot}`);
  }
  return { urls, checked, otroLabel };
}

/** The networks the page in front of us holds right now. */
export async function readRedesState(page: Page): Promise<StoredNetwork[]> {
  return parseRedes(await readFormValues(page));
}

/**
 * Writes the whole table at once, without touching a control the way a user would.
 *
 * Every checkbox on the real page carries an inline handler that needs jQuery,
 * and the "Otro" name sits in a box CvLAC keeps `display:none` until its box is
 * clicked — `page.fill` would wait for it to become editable and time out. The
 * values are what the POST carries, so they are set directly.
 */
export async function applyRedesState(page: Page, state: RedesFormState): Promise<void> {
  await page.evaluate((s: RedesFormState) => {
    const checked = new Set(s.checked);
    for (const [name, value] of Object.entries(s.urls)) {
      const field = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (field) field.value = value;
      const box = document.querySelector<HTMLInputElement>(
        `input[type="checkbox"][name="${name.replace('URL_', 'CHECK_')}"]`
      );
      if (box) box.checked = checked.has(name.replace('URL_', 'CHECK_'));
    }
    const otro = document.querySelector<HTMLInputElement>('input[name="txt_otro"]');
    if (otro) otro.value = s.otroLabel;
    // The box holding that name is hidden until CvLAC's own handler reveals it.
    const otroBox = document.getElementById('otro');
    if (otroBox && s.otroLabel) otroBox.style.display = '';
  }, state);
}

// ── The tools ────────────────────────────────────────────────────────────────

/** What the profile holds: the researcher's text and the networks they listed. */
export interface CvLACProfile {
  /** `txt_desc_perfil` — empty when nothing has been written. */
  description: string;
  networks: StoredNetwork[];
  /** Áreas de actuación, in CvLAC's order: the first one is the main one. */
  areas: Area[];
}

export async function readProfileTool(): Promise<CvLACProfile> {
  await session.login();
  const page = await session.getPage();
  try {
    await navigate(page, URLS.redes);
    const networks = await readRedesState(page);

    await navigate(page, URLS.perfil);
    const description = await readPerfilDescription(page);

    await navigate(page, URLS.areas);
    const areas = await readAreas(page);

    log.info('profile read', {
      networks: networks.length,
      description: description.length,
      areas: areas.length,
    });
    return { description, networks, areas };
  } finally {
    await page.close();
  }
}

async function readPerfilDescription(page: Page): Promise<string> {
  return page
    .$eval('textarea[name="txt_desc_perfil"]', (el) => (el as HTMLTextAreaElement).value)
    .catch(() => '');
}

export interface UpdateProfileRequest {
  /** Replaces `txt_desc_perfil`. Left alone when undefined. */
  description?: string;
  /** Merged over what is stored; a null url removes that network. */
  networks?: NetworkChange[];
  /**
   * The whole list of áreas de actuación, in order, by name or by CvLAC code.
   * Replaces what is stored — its order is data — so anything left out is a
   * removal and needs `confirmDelete`.
   */
  areas?: string[];
  /** Required for any change that removes a network or an área. */
  confirmDelete?: boolean;
}

/**
 * Writes the profile text, the network table, or both.
 *
 * Each half is saved by its own form, so each gets its own verdict: one can
 * land while the other does not, and saying "updated" for both would repeat the
 * mistake that reported three writes as saved during an outage.
 */
export async function updateProfileTool(req: UpdateProfileRequest): Promise<UpdateResult> {
  if (
    req.description === undefined &&
    (req.networks === undefined || req.networks.length === 0) &&
    req.areas === undefined
  ) {
    return {
      success: false,
      status: 'failed',
      message: 'Nothing to write: pass a description, a list of networks, a list of areas, or several.',
    };
  }

  // Both refusals happen before anything is opened, let alone written.
  if (req.description !== undefined) {
    const problem = checkDescription(req.description);
    if (problem) return { success: false, status: 'failed', message: problem };
  }
  const removals = deletionsIn(req.networks ?? []);
  if (removals.length > 0 && req.confirmDelete !== true) {
    return deleteConfirmation(`las redes académicas ${removals.join(', ')}`);
  }

  await session.login();
  const page = await session.getPage();
  const done: string[] = [];
  const warnings: string[] = [];
  let status: UpdateStatus = 'ok';
  let screenshotBase64: string | undefined;

  try {
    if (req.networks && req.networks.length > 0) {
      const outcome = await writeRedes(page, req.networks);
      done.push(outcome.message);
      if (outcome.status !== 'ok') status = outcome.status;
      if (outcome.warnings) warnings.push(...outcome.warnings);
    }

    if (req.areas !== undefined) {
      const outcome = await writeAreas(page, req.areas, req.confirmDelete === true);
      if (outcome.status === 'needs_confirmation') return outcome.result!;
      done.push(outcome.message);
      if (outcome.status !== 'ok') status = outcome.status;
      if (outcome.warnings) warnings.push(...outcome.warnings);
    }

    if (req.description !== undefined) {
      const outcome = await writePerfil(page, req.description);
      done.push(outcome.message);
      if (outcome.status !== 'ok') status = outcome.status;
      if (outcome.warnings) warnings.push(...outcome.warnings);
    }

    screenshotBase64 = await session.takeScreenshot(page).catch(() => undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('update_profile failed', { error: message });
    return { success: false, status: 'failed', message, warnings: warnings.length ? warnings : undefined };
  } finally {
    await page.close();
  }

  return {
    success: status === 'ok',
    status,
    message: done.join(' '),
    warnings: warnings.length ? warnings : undefined,
    screenshotBase64,
  };
}

interface HalfResult {
  status: UpdateStatus | 'needs_confirmation';
  message: string;
  warnings?: string[];
  /** Carried through unchanged when a half has to stop and ask. */
  result?: UpdateResult;
}

/**
 * Writes the áreas de actuación.
 *
 * The whole list is replaced, because its order is what CvLAC stores. Each name
 * is resolved against the catalogue the popup page carries, and an ambiguous one
 * is a question, not a guess — the same rule the institution picker follows.
 */
async function writeAreas(page: Page, names: string[], confirmDelete: boolean): Promise<HalfResult> {
  await navigate(page, URLS.areas);
  const current = await readAreas(page);

  await navigate(page, URLS.areasCatalogo);
  const catalogue = await readAreaCatalogue(page);
  if (catalogue.length === 0) {
    return {
      status: 'failed',
      message: 'Áreas de actuación: CvLAC no devolvió su catálogo de áreas, así que no se escribió nada.',
    };
  }

  const desired: Area[] = [];
  for (const name of names) {
    const byCode = catalogue.find((a) => a.code.toLowerCase() === name.trim().toLowerCase());
    if (byCode) {
      desired.push({ code: byCode.code, name: byCode.name });
      continue;
    }
    const resolved = resolveChoice(catalogue, name, (a) => a.name);
    if (resolved.kind === 'none') {
      return {
        status: 'failed',
        message: `Áreas de actuación: "${name}" no está en el catálogo de CvLAC, y no se escribió nada.`,
      };
    }
    if (resolved.kind === 'ambiguous') {
      return {
        status: 'needs_confirmation',
        message: 'ambiguous area',
        result: choiceConfirmation(
          'área de conocimiento',
          name,
          resolved.options.map((a) => ({ id: a.code, label: a.name }))
        ),
      };
    }
    desired.push({ code: resolved.item.code, name: resolved.item.name });
  }

  const removals = areaRemovals(current, desired);
  if (removals.length > 0 && !confirmDelete) {
    return {
      status: 'needs_confirmation',
      message: 'areas removed',
      result: deleteConfirmation(`las áreas de actuación ${removals.join(', ')}`),
    };
  }

  await navigate(page, URLS.areas);
  await applyAreas(page, desired);
  await clickGuardar(page);

  if (await landedOnOutage(page)) {
    return {
      status: 'unverified',
      message: 'Áreas de actuación: se envió con CvLAC caído; verifícalo con read_profile antes de reintentar.',
    };
  }
  const errors = await readFormErrors(page);
  if (errors.length > 0) {
    return { status: 'failed', message: `Áreas de actuación rechazadas: ${errors.join(' | ')}` };
  }

  await navigate(page, URLS.areas);
  const stored = await readAreas(page);
  const same =
    stored.length === desired.length && stored.every((a, i) => a.code === desired[i].code);
  if (!same) {
    return {
      status: 'unverified',
      message:
        `Áreas de actuación: CvLAC devolvió ${stored.length} (${stored.map((a) => a.name).join(', ') || 'ninguna'}) ` +
        `en vez de las ${desired.length} enviadas; verifícalo con read_profile.`,
    };
  }
  return { status: 'ok', message: `Áreas de actuación guardadas (${stored.length}).` };
}

async function writeRedes(page: Page, changes: NetworkChange[]): Promise<HalfResult> {
  await navigate(page, URLS.redes);
  const stored = await readRedesState(page);
  // Throws on an unknown network or an unusable URL, before anything is written.
  const desired = mergeRedes(stored, changes);

  await applyRedesState(page, desired);
  await clickGuardar(page);

  if (await landedOnOutage(page)) {
    return {
      status: 'unverified',
      message: 'Academic networks: submitted while CvLAC was down; verify with read_profile before retrying.',
    };
  }

  const errors = await readFormErrors(page);
  if (errors.length > 0) {
    return { status: 'failed', message: `Academic networks rejected: ${errors.join(' | ')}` };
  }

  // The stored URLs come back verbatim, so this comparison is exact.
  await navigate(page, URLS.redes);
  const after = await readRedesState(page);
  const wanted = Object.entries(desired.urls).filter(([, url]) => url);
  const disagreeing = wanted
    .filter(([name, url]) => after.find((n) => `URL_${n.slot}` === name)?.url !== url)
    .map(([name]) => name);

  if (after.length === 0 && wanted.length > 0) {
    return {
      status: 'unverified',
      message: 'Academic networks: could not read the table back; verify with read_profile before retrying.',
    };
  }
  if (disagreeing.length > 0) {
    return {
      status: 'failed',
      message: `Academic networks: CvLAC kept its previous value in ${disagreeing.join(', ')}.`,
    };
  }
  return { status: 'ok', message: `Academic networks saved (${after.length} stored).` };
}

async function writePerfil(page: Page, description: string): Promise<HalfResult> {
  await navigate(page, URLS.perfil);
  // The form carries the person's identity in hidden fields — name, document,
  // birth date, municipality — and posts them back. Only the textarea is touched
  // so that they ride along exactly as CvLAC sent them.
  await page.fill('textarea[name="txt_desc_perfil"]', description);
  await clickGuardar(page);

  if (await landedOnOutage(page)) {
    return {
      status: 'unverified',
      message: 'Profile text: submitted while CvLAC was down; verify with read_profile before retrying.',
    };
  }

  const errors = await readFormErrors(page);
  if (errors.length > 0) {
    return { status: 'failed', message: `Profile text rejected: ${errors.join(' | ')}` };
  }

  await navigate(page, URLS.perfil);
  const stored = await readPerfilDescription(page);
  if (stored.replace(/\s+/g, ' ').trim() !== description.replace(/\s+/g, ' ').trim()) {
    return {
      status: 'unverified',
      message: `Profile text: CvLAC read back ${stored.length} characters instead of ${description.length}; verify with read_profile.`,
    };
  }
  return { status: 'ok', message: 'Profile text saved.' };
}

/** What `txt_desc_perfil` holds, per its own attributes. */
const MAX_DESCRIPTION = 3950;

/**
 * Why CvLAC would refuse this profile text, or null when it would take it.
 *
 * The field is marked `required`, so there is no way to blank it once written:
 * a submit with it empty never leaves the form, and the page comes back showing
 * the text it just refused to erase — which read as "rejected: <that text>".
 */
export function checkDescription(text: string): string | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    return 'CvLAC marca el texto de perfil como obligatorio: no se puede dejar vacío, solo reemplazar. Bórralo desde la web si de verdad quieres quitarlo.';
  }
  if (trimmed.length > MAX_DESCRIPTION) {
    return `El texto tiene ${trimmed.length} caracteres y el campo acepta ${MAX_DESCRIPTION}.`;
  }
  return null;
}

/** The networks a change would remove, named — so a confirmation can list them. */
export function deletionsIn(changes: NetworkChange[]): string[] {
  return changes
    .filter((c) => c.url === null || (c.url ?? '').trim() === '')
    .map((c) => c.network);
}

export interface ProfileSnapshot {
  description: string;
  networks: StoredNetwork[];
}

export interface RestorePoint {
  /** What to write back, or null when there is nothing to restore. */
  description: string | null;
  networks: StoredNetwork[];
  /** What was found that an earlier run left behind, named for a human. */
  leftovers: string[];
}

/**
 * What a test run should put back when it finishes.
 *
 * Not simply the snapshot. A run that could not clean up leaves its own data in
 * the account, and the next run read that as the real state and restored it
 * faithfully — the suite kept its own rubbish alive. Anything carrying the tag
 * is rubbish, not state.
 *
 * `description` comes back null when it was empty as well: CvLAC refuses an
 * empty profile text, so "as it was" is not somewhere this can return to.
 */
export function restorePoint(snapshot: ProfileSnapshot, tag: string): RestorePoint {
  const marker = tag.toLowerCase().replace(/\s+/g, '-');
  const tagged = (text: string): boolean => {
    const lower = (text ?? '').toLowerCase();
    return lower.includes(tag.toLowerCase()) || lower.includes(marker);
  };

  const leftovers: string[] = [];
  const description = (snapshot.description ?? '').trim();
  if (description && tagged(description)) leftovers.push('texto de perfil');

  const networks = snapshot.networks.filter((n) => {
    if (tagged(n.url) || tagged(n.label)) {
      leftovers.push(n.key);
      return false;
    }
    return true;
  });

  return {
    description: description && !tagged(description) ? description : null,
    networks,
    leftovers,
  };
}
