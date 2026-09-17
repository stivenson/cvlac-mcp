#!/usr/bin/env node
/**
 * Live CRUD suite against a real CvLAC account.
 *
 * For each of the seven sections it creates one clearly marked test item, lists
 * it, reads its record page, re-adds it to check the duplicate guard, edits it,
 * verifies the edit on the record page and deletes it — then verifies it is gone.
 *
 * `perfil` covers the two singleton records — the profile text and the academic
 * networks — which have no list. It runs on an account that holds none of them:
 * it picks an unused row, and puts back whatever it found.
 *
 * This writes to an official MinCiencias record, so it refuses to run without
 * CVLAC_E2E=1 and it always attempts cleanup, reporting anything it could not
 * remove so a human can delete it by hand.
 *
 *   CVLAC_E2E=1 node tests/e2e/live-crud.mjs [--sections=cursos,software]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { connect, call } from './mcp-client.mjs';
// From dist/, the same build the suite drives over stdio.
import { restorePoint } from '../../dist/tools/profile.js';

const HERE = dirname(fileURLToPath(import.meta.url));

if (process.env.CVLAC_E2E !== '1') {
  console.error(
    'Refusing to run: this suite writes to a real CvLAC account.\n' +
      'Set CVLAC_E2E=1 if that is what you want.'
  );
  process.exit(2);
}

/** Marks every row this suite creates, so an orphan is obvious in the web UI. */
const TAG = 'ZZ PRUEBA MCP';

const argSections = process.argv.find((a) => a.startsWith('--sections='));
const only = argSections ? argSections.split('=')[1].split(',').map((s) => s.trim()) : null;

// ── What to write in each section ────────────────────────────────────────────

/**
 * `add` is the item created; `update` is the same item with one field changed —
 * the label must stay identical, because that is how update/delete find the row.
 * `evidence` is the value that must show up on the record page afterwards.
 */
const PLAN = {
  demasTrabajos: {
    labelField: 'name',
    add: {
      name: `${TAG} trabajo de prueba`,
      year: '2024',
      month: '3',
      // The form preselects Papel; Internet proves the medium was really set.
      medio: 'Internet',
      finalidad: 'Finalidad de prueba escrita por la suite e2e.',
    },
    // The list shows the year, so the edit is visible without the record page.
    update: { year: '2025' },
    evidence: '2025',
  },
  formacionComple: {
    labelField: 'degree',
    // Same catalogue problem as formación académica: CvLAC only accepts a
    // programme its own list holds for that institution and level.
    candidates: ['INGENIERIA DE ALIMENTOS', 'INGENIERIA BIOMEDICA', 'INGENIERIA AMBIENTAL'],
    add: {
      institution: 'Universidad de los Andes',
      // Six rows share that name; 663 is CvLAC's canonical one.
      institucionId: '663',
      degree: '',
      period: '2019 - 2019',
      // FC's level catalogue is its own (Y/8/F/E); "Diplomado" resolves to 8.
      nivel: '8',
      startMonth: '3',
    },
    update: { period: '2019 - 2020' },
    evidence: '2020',
  },
  idiomas: {
    labelField: 'language',
    // The four levels are deliberately different. The update then flips the
    // first of them, so a mis-mapped column shows up as a failed evidence check
    // instead of as silently mislabelled data — the list has no <th> to read the
    // order from, and this account grades every language the same.
    add: {
      language: 'Italiano',
      read: 'Bueno',
      write: 'Aceptable',
      speak: 'Deficiente',
      listen: 'Bueno',
    },
    update: { read: 'Deficiente' },
    evidence: '"read":"Deficiente"',
  },
  lineas: {
    labelField: 'name',
    add: {
      name: `${TAG} línea de prueba`,
      active: true,
      objective: 'Objeto de prueba escrito por la suite e2e.',
    },
    update: { objective: 'Objeto de prueba EDITADO por la suite e2e.' },
    evidence: 'EDITADO',
  },
  formacion: {
    labelField: 'degree',
    // CvLAC only accepts a programme its catalogue lists for that institution
    // and level, so — like experiencia — the label cannot be an invented string.
    // The runner takes the first candidate that collides with no real row.
    candidates: [
      'INGENIERIA DE ALIMENTOS',
      'INGENIERIA BIOMEDICA',
      'INGENIERIA AMBIENTAL',
    ],
    add: {
      institution: 'Universidad de los Andes',
      // Six catalogue rows share that name; 663 is CvLAC's canonical one.
      institucionId: '663',
      degree: '',
      period: '2019 - 2021',
    },
    update: { period: '2019 - 2022' },
    evidence: '2022',
  },
  experiencia: {
    labelField: 'company',
    // The label here is an institution name, and CvLAC only accepts names from
    // its own catalogue — so it cannot be a made-up string like the others.
    // The runner picks the first candidate that collides with no real row.
    candidates: [
      { label: 'Universidad de los Andes', institucionId: '663' },
      { label: 'Universidad Simón Bolívar', institucionId: '603' },
      { label: 'Universidad Francisco de Paula Santander' },
    ],
    add: { company: '', role: 'Prueba automatizada', period: '2019 - 2020' },
    update: { period: '2019 - 2021' },
    evidence: '2021',
  },
  cursos: {
    labelField: 'name',
    add: {
      name: `${TAG} Curso`,
      date: '2024-03',
      duracionHoras: 2,
      lugar: 'Prueba automatizada',
    },
    update: { date: '2025-03' },
    evidence: '2025',
  },
  reconocimientos: {
    labelField: 'title',
    add: { title: `${TAG} Reconocimiento`, year: '2024', month: '5', ambito: 'N' },
    update: { year: '2025' },
    evidence: '2025',
  },
  proyectos: {
    labelField: 'title',
    add: {
      title: `${TAG} Proyecto`,
      description: 'Ítem de prueba creado por la suite e2e de cvlac-mcp. Se borra al terminar.',
      tipoProyecto: 'EX',
      startYear: '2024',
      startMonth: '3',
    },
    // The project record page shows the summary and never the dates, so the
    // edit has to land somewhere it can be read back.
    update: { description: 'Ítem de prueba creado por la suite e2e de cvlac-mcp. Editado para verificar.' },
    evidence: 'Editado para verificar',
  },
  software: {
    labelField: 'name',
    add: {
      name: `${TAG} Software`,
      year: '2024',
      month: '3',
      tipoSoftware: '211',
      url: 'https://example.org/prueba-mcp',
      description: 'Ítem de prueba creado por la suite e2e de cvlac-mcp. Se borra al terminar.',
    },
    update: { year: '2025' },
    evidence: '2025',
  },
  eventos: {
    labelField: 'name',
    add: {
      name: `${TAG} Evento`,
      startDate: '01/03/2024',
      endDate: '01/03/2024',
      lugar: 'Prueba automatizada',
      ciudad: 'Cúcuta',
      codMunicipio: '54001',
      tipoEvento: 'TA',
      ambito: 'N',
      rol: 'PO',
      institution: 'Universidad de los Andes',
      resumen: 'Ítem de prueba creado por la suite e2e de cvlac-mcp. Se borra al terminar.',
    },
    // The evento record page shows no dates at all, so the edit has to land on
    // something it does display.
    update: { lugar: 'Prueba automatizada (editado)' },
    evidence: 'Prueba automatizada (editado)',
  },
};

/** Which field of a listed item carries the label, per section. */
const LIST_LABEL = {
  formacion: 'degree',
  experiencia: 'company',
  cursos: 'name',
  reconocimientos: 'title',
  proyectos: 'title',
  software: 'name',
  eventos: 'name',
  formacionComple: 'degree',
  idiomas: 'language',
  lineas: 'name',
  demasTrabajos: 'name',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const norm = (s) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function listLabels(sectionData, section) {
  const key = LIST_LABEL[section];
  // Rows whose label column is empty — CvLAC has a few — would otherwise match
  // every candidate, since every string contains the empty string.
  return (sectionData?.[section] ?? []).map((item) => item[key] ?? '').filter((l) => l.trim() !== '');
}

function present(labels, label) {
  const t = norm(label);
  return labels.some((l) => norm(l) === t || norm(l).includes(t));
}

function fieldsToText(detail) {
  if (!detail?.fields) return detail?.text ?? '';
  return detail.fields.map((f) => `${f.label}=${f.value}`).join(' | ');
}

const results = [];

/** Where a failing step's screenshot lands, so a rejection can be looked at. */
const SHOTS = join(HERE, 'shots');

/**
 * Writes the screenshot `update_section` returns and swaps the base64 for its
 * path: a report with three base64 PNGs inline is unreadable, and dropping them
 * altogether is what left the first live run with no way to see why a form
 * bounced.
 */
function keepScreenshot(section, step, payload) {
  const base64 = payload?.screenshotBase64;
  if (!base64) return payload;

  const { screenshotBase64, ...rest } = payload;
  try {
    mkdirSync(SHOTS, { recursive: true });
    const file = join(SHOTS, `${section}-${step.replace(/[^a-z0-9]+/gi, '-')}.png`);
    writeFileSync(file, Buffer.from(base64, 'base64'));
    return { ...rest, screenshot: file };
  } catch (err) {
    return { ...rest, screenshot: `no se pudo guardar: ${err.message}` };
  }
}

function record(section, step, ok, detail, payload) {
  results.push({ section, step, ok, detail, payload: keepScreenshot(section, step, payload) });
  const mark = ok === true ? '✅' : ok === false ? '❌' : '⚠️ ';
  console.log(`${mark} ${section} › ${step}${detail ? ` — ${detail}` : ''}`);
}

/** Runs one step, turning a thrown error into a recorded failure. */
async function step(section, name, fn) {
  try {
    return await fn();
  } catch (err) {
    record(section, name, false, err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ── The suite ────────────────────────────────────────────────────────────────

async function runSection(client, section) {
  const plan = PLAN[section];
  const labelField = plan.labelField;
  const addData = { ...plan.add };

  console.log(`\n──────── ${section} ────────`);

  // 1. list (before)
  const before = await step(section, 'list (antes)', () => call(client, 'read_cvlac', { section }));
  if (!before || !before[section]) {
    record(section, 'list (antes)', false, 'read_cvlac no devolvió la sección', before);
    return;
  }
  const labelsBefore = listLabels(before, section);
  record(section, 'list (antes)', true, `${labelsBefore.length} ítem(s) reales`);

  // Experiencia's label must exist in CvLAC's institution catalogue, so pick one
  // that no real row already uses — otherwise update/delete could hit real data.
  if (plan.candidates) {
    // A candidate is either a plain name or {label, institucionId}. CvLAC's
    // institution catalogue holds six rows literally called "Universidad de los
    // Andes", so a name alone is refused — by design — and the id settles it.
    const cands = plan.candidates.map((c) => (typeof c === 'string' ? { label: c } : c));
    const free = cands.find(
      (c) => !present(labelsBefore, c.label) && !labelsBefore.some((l) => norm(c.label).includes(norm(l)))
    );
    if (!free) {
      record(
        section,
        'elegir etiqueta',
        null,
        `todos los candidatos chocan con filas reales: ${cands.map((c) => c.label).join(', ')}`
      );
      return;
    }
    addData[labelField] = free.label;
    if (free.institucionId) addData.institucionId = free.institucionId;
    record(section, 'elegir etiqueta', true, `"${free.label}" no choca con ninguna fila real`);
  }

  const label = addData[labelField];
  if (present(labelsBefore, label)) {
    record(section, 'etiqueta libre', false, `"${label}" ya existe; abortando para no tocar datos reales`);
    return;
  }

  let created = false;
  try {
    // 2. add
    const added = await step(section, 'add', () =>
      call(client, 'update_section', { section, action: 'add', data: addData })
    );
    if (added?.status === 'ok') {
      created = true;
      record(section, 'add', true, added.message, added);
    } else if (added?.status === 'needs_confirmation' && added?.choices?.length) {
      // Working as intended: the name matched several catalogue rows and the
      // tool refused to choose. The suite has no human to ask.
      const ch = added.choices[0];
      record(
        section,
        'add',
        null,
        `omitido: "${ch.value}" coincide con ${ch.options.length} filas del catálogo de ${ch.field}. ` +
          `Pásale una en el plan: ${ch.options.map((o) => `${o.id}=${o.label}`).join(' | ').slice(0, 200)}`,
        added
      );
      return;
    } else if (/programa académico/i.test(added?.message ?? '')) {
      // Not a defect: CvLAC only offers programmes already registered for that
      // institution and level, and its picker has no way to add one. The tool
      // refused instead of submitting a form it knew was incomplete.
      record(
        section,
        'add',
        null,
        `omitido: CvLAC no tiene ningún programa académico registrado para esa institución en ese nivel, ` +
          `y su buscador no permite crear uno. ${added.message}`,
        added
      );
      return;
    } else {
      record(section, 'add', false, added?.message ?? added?.raw ?? 'sin respuesta', added);
      return;
    }

    // 3. list (after add)
    const afterAdd = await step(section, 'list (tras add)', () => call(client, 'read_cvlac', { section }));
    const labelsAfterAdd = listLabels(afterAdd, section);
    record(
      section,
      'list (tras add)',
      present(labelsAfterAdd, label),
      `${labelsAfterAdd.length} ítem(s); "${label}" ${present(labelsAfterAdd, label) ? 'aparece' : 'NO aparece'}`
    );

    // 4. detail
    const detailAfterAdd = await step(section, 'detail (tras add)', () =>
      call(client, 'read_cvlac_detail', { section, label })
    );
    record(
      section,
      'detail (tras add)',
      detailAfterAdd?.found === true && (detailAfterAdd.fields?.length ?? 0) > 0,
      detailAfterAdd?.found
        ? `${detailAfterAdd.fields?.length ?? 0} campo(s): ${fieldsToText(detailAfterAdd).slice(0, 300)}`
        : detailAfterAdd?.message ?? 'sin respuesta',
      detailAfterAdd
    );

    // 5. duplicate guard: the same add must refuse to write
    const dup = await step(section, 'add duplicado', () =>
      call(client, 'update_section', { section, action: 'add', data: addData })
    );
    record(
      section,
      'add duplicado',
      dup?.status === 'needs_confirmation',
      dup?.status === 'needs_confirmation'
        ? `bloqueado; candidatos: ${(dup.similar ?? []).map((s) => s.label).join(', ').slice(0, 160)}`
        : `esperaba needs_confirmation, obtuve "${dup?.status}" — ${dup?.message ?? ''}`,
      dup
    );

    // 6. update
    const updateData = { ...addData, ...plan.update };
    const updated = await step(section, 'update', () =>
      call(client, 'update_section', { section, action: 'update', data: updateData })
    );
    record(
      section,
      'update',
      // `unverified` means the write went out and CvLAC never confirmed it —
      // the next step decides, so it is not counted as a failure here.
      updated?.status === 'unverified' ? null : updated?.status === 'ok',
      updated?.message ?? updated?.raw ?? 'sin respuesta',
      updated
    );

    // 7. detail (after update) — the only place most sections show the change
    const detailAfterUpdate = await step(section, 'detail (tras update)', () =>
      call(client, 'read_cvlac_detail', { section, label })
    );
    // Some record pages leave fields out that the list does show — formación
    // keeps its period only in the list — so both are searched for the evidence.
    const listAfterUpdate = await step(section, 'list (tras update)', () =>
      call(client, 'read_cvlac', { section })
    );
    const rowAfterUpdate = (listAfterUpdate?.[section] ?? []).find(
      (item) => norm(item[LIST_LABEL[section]] ?? '') === norm(label)
    );
    const rowText = rowAfterUpdate ? JSON.stringify(rowAfterUpdate) : '';
    const textBefore = fieldsToText(detailAfterAdd);
    const textAfter = `${fieldsToText(detailAfterUpdate)}${rowText ? ` | lista: ${rowText}` : ''}`;
    const hasEvidence = textAfter.includes(plan.evidence);
    record(
      section,
      'update verificado',
      hasEvidence && textAfter !== textBefore,
      hasEvidence
        ? textAfter === textBefore
          ? `"${plan.evidence}" está presente pero la ficha no cambió`
          : `"${plan.evidence}" quedó guardado`
        : `"${plan.evidence}" NO aparece en la ficha: ${textAfter.slice(0, 300)}`,
      { textBefore: textBefore.slice(0, 600), textAfter: textAfter.slice(0, 600) }
    );
  } finally {
    if (created) {
      // 8. delete
      // The gate first: a delete that nobody confirmed must remove nothing.
      const unconfirmed = await step(section, 'delete sin confirmar', () =>
        call(client, 'update_section', { section, action: 'delete', data: { [labelField]: label } })
      );
      record(
        section,
        'delete sin confirmar',
        unconfirmed?.status === 'needs_confirmation',
        unconfirmed?.status === 'needs_confirmation'
          ? 'bloqueado, como debe ser'
          : `esperaba needs_confirmation, obtuve "${unconfirmed?.status}" — ${unconfirmed?.message ?? ''}`,
        unconfirmed
      );

      const deleted = await step(section, 'delete', () =>
        call(client, 'update_section', {
          section,
          action: 'delete',
          data: { [labelField]: label },
          confirm_delete: true,
        })
      );
      record(
        section,
        'delete',
        deleted?.status === 'ok',
        deleted?.message ?? deleted?.raw ?? 'sin respuesta',
        deleted
      );

      // 9. list (final) — the cleanup check that matters
      const finalList = await step(section, 'list (final)', () => call(client, 'read_cvlac', { section }));
      const stillThere = present(listLabels(finalList, section), label);
      record(
        section,
        'list (final)',
        !stillThere,
        stillThere ? `⚠️ "${label}" SIGUE EN TU CvLAC — bórralo a mano` : 'quedó limpio'
      );
    }
  }
}


// ── Perfil y redes académicas ────────────────────────────────────────────────

/**
 * CRUD over the two singleton records: the profile text and the network table.
 *
 * These have no list and no per-item page, so the shape is different: the whole
 * state is read first and put back at the end. That snapshot is not a nicety —
 * `ReRedSocialIdent/insert.do` rewrites the whole table from what the form
 * posts, so the test worth running is whether an account's *real* networks
 * survive a write that only meant to add one.
 *
 * It runs on an account that has none of this: it picks a row nobody is using,
 * and restores whatever it found.
 */
async function runProfile(client) {
  const section = 'perfil';
  console.log(`\n──────── ${section} ────────`);

  const snapshot = await step(section, 'snapshot', () => call(client, 'read_profile', {}));
  if (!snapshot || !Array.isArray(snapshot.networks)) {
    record(section, 'snapshot', false, 'read_profile no devolvió el perfil', snapshot);
    return;
  }
  const storedKeys = snapshot.networks.map((n) => n.key);
  record(
    section,
    'snapshot',
    true,
    `${snapshot.networks.length} red(es) [${storedKeys.join(', ') || 'ninguna'}], ` +
      `perfil de ${snapshot.description.length} caracteres`
  );

  // A row nobody is using, so a real profile is never overwritten. "otro" is
  // left alone on purpose: it is the one a person is most likely to have filled.
  const free = ['researchgate', 'academia_edu', 'mendeley', 'ssr', 'researcher_id'].find(
    (k) => !storedKeys.includes(k)
  );
  if (!free) {
    record(section, 'elegir red', null, 'todas las redes candidatas están ocupadas por datos reales');
    return;
  }
  record(section, 'elegir red', true, `"${free}" está libre`);

  const TEST_URL = 'https://example.org/zz-prueba-mcp';
  const TEST_URL_2 = 'https://example.org/zz-prueba-mcp-editada';
  const TEST_TEXT = `${TAG} — texto de prueba del perfil, escrito por la suite e2e.`;

  /** Every pre-existing network must still be there, with its URL untouched. */
  const realSurvived = (networks) =>
    snapshot.networks.every((was) => networks.find((n) => n.key === was.key)?.url === was.url);

  let wrote = false;
  try {
    // 1. add
    const added = await step(section, 'add red', () =>
      call(client, 'update_profile', { networks: [{ network: free, url: TEST_URL }] })
    );
    if (added?.status === 'ok' || added?.status === 'unverified') wrote = true;
    record(
      section,
      'add red',
      added?.status === 'unverified' ? null : added?.status === 'ok',
      added?.message ?? added?.raw ?? 'sin respuesta',
      added
    );

    // 2. verify — both that it landed and that nothing else was swept away
    const afterAdd = await step(section, 'verificar add', () => call(client, 'read_profile', {}));
    const addedRow = (afterAdd?.networks ?? []).find((n) => n.key === free);
    record(
      section,
      'verificar add',
      addedRow?.url === TEST_URL && realSurvived(afterAdd?.networks ?? []),
      addedRow?.url === TEST_URL
        ? realSurvived(afterAdd?.networks ?? [])
          ? `"${free}" guardada y las ${snapshot.networks.length} red(es) reales siguen intactas`
          : `⚠️ "${free}" se guardó pero SE PERDIERON redes reales: ${storedKeys.join(', ')}`
        : `"${free}" no quedó guardada (leí ${addedRow?.url ?? 'nada'})`,
      afterAdd
    );

    // 3. update — the same row, another URL
    const edited = await step(section, 'update red', () =>
      call(client, 'update_profile', { networks: [{ network: free, url: TEST_URL_2 }] })
    );
    record(
      section,
      'update red',
      edited?.status === 'unverified' ? null : edited?.status === 'ok',
      edited?.message ?? edited?.raw ?? 'sin respuesta',
      edited
    );

    const afterEdit = await step(section, 'verificar update', () => call(client, 'read_profile', {}));
    const editedRow = (afterEdit?.networks ?? []).find((n) => n.key === free);
    record(
      section,
      'verificar update',
      editedRow?.url === TEST_URL_2,
      editedRow?.url === TEST_URL_2 ? 'la URL quedó actualizada' : `leí "${editedRow?.url ?? 'nada'}"`,
      afterEdit
    );

    // 4. removing a network must be confirmed first
    const unconfirmed = await step(section, 'borrar red sin confirmar', () =>
      call(client, 'update_profile', { networks: [{ network: free, url: null }] })
    );
    record(
      section,
      'borrar red sin confirmar',
      unconfirmed?.status === 'needs_confirmation',
      unconfirmed?.status === 'needs_confirmation'
        ? 'bloqueado, como debe ser'
        : `esperaba needs_confirmation, obtuve "${unconfirmed?.status}"`,
      unconfirmed
    );

    const stillThere = await step(section, 'la red sigue tras el bloqueo', () =>
      call(client, 'read_profile', {})
    );
    record(
      section,
      'la red sigue tras el bloqueo',
      (stillThere?.networks ?? []).some((n) => n.key === free),
      (stillThere?.networks ?? []).some((n) => n.key === free)
        ? 'no se borró nada'
        : '⚠️ la red desapareció pese al bloqueo',
      stillThere
    );

    // 5. a network this server cannot place must be refused, not guessed
    const bogus = await step(section, 'red desconocida', () =>
      call(client, 'update_profile', { networks: [{ network: 'Fotolog', url: TEST_URL }] })
    );
    record(
      section,
      'red desconocida',
      bogus?.status === 'failed',
      bogus?.status === 'failed'
        ? `rechazada: ${String(bogus.message).slice(0, 120)}`
        : `esperaba failed, obtuve "${bogus?.status}"`,
      bogus
    );

    // 6. the profile text, written and read back
    const textWritten = await step(section, 'escribir perfil', () =>
      call(client, 'update_profile', { description: TEST_TEXT })
    );
    record(
      section,
      'escribir perfil',
      textWritten?.status === 'unverified' ? null : textWritten?.status === 'ok',
      textWritten?.message ?? textWritten?.raw ?? 'sin respuesta',
      textWritten
    );

    const afterText = await step(section, 'verificar perfil', () => call(client, 'read_profile', {}));
    record(
      section,
      'verificar perfil',
      (afterText?.description ?? '').includes(TAG),
      (afterText?.description ?? '').includes(TAG)
        ? `${afterText.description.length} caracteres guardados`
        : `el texto no quedó: "${(afterText?.description ?? '').slice(0, 120)}"`,
      afterText
    );
  } finally {
    // 7. delete + restore. Not back to the snapshot: a previous run's leftovers
    // are rubbish, not state, and restoring them is how this suite kept its own
    // test text alive across runs.
    const point = restorePoint(snapshot, TAG);
    if (point.leftovers.length) {
      record(
        section,
        'basura de una corrida anterior',
        null,
        `no la restauro: ${point.leftovers.join(', ')}`
      );
    }
    const restored = await step(section, 'restaurar', () =>
      call(client, 'update_profile', {
        // CvLAC marks the profile text required, so there is no way back to an
        // empty one. When there was nothing to restore, the text is left as is
        // and reported below for a human to clear from the web.
        ...(point.description === null ? {} : { description: point.description }),
        networks: wrote ? [{ network: free, url: null }] : [],
        confirm_delete: true,
      })
    );
    record(
      section,
      'restaurar',
      restored?.status === 'unverified' ? null : restored?.status === 'ok',
      restored?.message ?? restored?.raw ?? 'sin respuesta',
      restored
    );

    const finalState = await step(section, 'estado final', () => call(client, 'read_profile', {}));
    const leftovers = (finalState?.networks ?? []).filter((n) => n.url.includes('zz-prueba-mcp'));
    const textLeft = (finalState?.description ?? '').includes(TAG);
    const networksClean = leftovers.length === 0 && realSurvived(finalState?.networks ?? []);
    record(
      section,
      'estado final',
      // The leftover text is not a failure of this suite: CvLAC refuses to store
      // an empty profile, so a test text written on an account that had none can
      // only be replaced, never removed. Everything else must be spotless.
      networksClean ? (textLeft ? null : true) : false,
      leftovers.length
        ? `⚠️ QUEDARON REDES DE PRUEBA: ${leftovers.map((l) => l.key).join(', ')} — bórralas a mano`
        : !realSurvived(finalState?.networks ?? [])
          ? `⚠️ faltan redes que existían antes: ${storedKeys.join(', ')}`
          : textLeft
            ? 'redes limpias. El texto de prueba queda: CvLAC no acepta un perfil vacío, así que ' +
              'solo se puede reemplazar — escribe el tuyo o bórralo desde la web'
            : 'quedó como estaba',
      finalState
    );
  }
}

async function main() {
  // `perfil` is not in PLAN: it has no list, so it runs its own shape.
  const all = [...Object.keys(PLAN), 'perfil'];
  const sections = (only ?? all).filter((s) => {
    if (all.includes(s)) return true;
    console.error(`Sección desconocida: ${s}`);
    return false;
  });

  const client = await connect({ logFile: join(HERE, 'live-crud.log') });
  try {
    for (const section of sections) {
      if (section === 'perfil') await runProfile(client);
      else await runSection(client, section);
    }
  } finally {
    await client.close();
  }

  const reportPath = join(HERE, `report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(reportPath, JSON.stringify({ tag: TAG, sections, results }, null, 2));

  // Summary
  console.log('\n════════ RESUMEN ════════');
  const bySection = {};
  for (const r of results) (bySection[r.section] ??= []).push(r);
  for (const [section, rows] of Object.entries(bySection)) {
    const failed = rows.filter((r) => r.ok === false).map((r) => r.step);
    console.log(
      `${failed.length === 0 ? '✅' : '❌'} ${section.padEnd(16)} ${rows.length} pasos` +
        (failed.length ? ` — fallaron: ${failed.join(', ')}` : '')
    );
  }
  const orphans = results.filter((r) => r.step === 'list (final)' && r.ok === false);
  if (orphans.length) {
    console.log('\n⚠️  ÍTEMS DE PRUEBA QUE QUEDARON EN EL CvLAC:');
    for (const o of orphans) console.log(`   - ${o.section}: ${o.detail}`);
  }
  console.log(`\nReporte: ${reportPath}`);
  process.exit(results.some((r) => r.ok === false) ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
