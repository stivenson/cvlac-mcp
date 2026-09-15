#!/usr/bin/env node
/**
 * Live CRUD suite against a real CvLAC account.
 *
 * For each of the seven sections it creates one clearly marked test item, lists
 * it, reads its record page, re-adds it to check the duplicate guard, edits it,
 * verifies the edit on the record page and deletes it — then verifies it is gone.
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
      'Universidad de los Andes',
      'Universidad Simón Bolívar',
      'Universidad Francisco de Paula Santander',
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
    update: { startYear: '2025' },
    evidence: '2025',
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
    update: { startDate: '02/03/2024' },
    evidence: '02/03/2024',
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
  return (sectionData?.[section] ?? []).map((item) => item[key] ?? '');
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
    const free = plan.candidates.find((c) => !present(labelsBefore, c) && !labelsBefore.some((l) => norm(c).includes(norm(l))));
    if (!free) {
      record(section, 'elegir etiqueta', null, `todos los candidatos chocan con filas reales: ${plan.candidates.join(', ')}`);
      return;
    }
    addData[labelField] = free;
    record(section, 'elegir etiqueta', true, `"${free}" no choca con ninguna fila real`);
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
      updated?.status === 'ok',
      updated?.message ?? updated?.raw ?? 'sin respuesta',
      updated
    );

    // 7. detail (after update) — the only place most sections show the change
    const detailAfterUpdate = await step(section, 'detail (tras update)', () =>
      call(client, 'read_cvlac_detail', { section, label })
    );
    const textBefore = fieldsToText(detailAfterAdd);
    const textAfter = fieldsToText(detailAfterUpdate);
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
      const deleted = await step(section, 'delete', () =>
        call(client, 'update_section', { section, action: 'delete', data: { [labelField]: label } })
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

async function main() {
  const sections = (only ?? Object.keys(PLAN)).filter((s) => {
    if (PLAN[s]) return true;
    console.error(`Sección desconocida: ${s}`);
    return false;
  });

  const client = await connect({ logFile: join(HERE, 'live-crud.log') });
  try {
    for (const section of sections) {
      await runSection(client, section);
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
