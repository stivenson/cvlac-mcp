import { diffTool } from './diff.js';
import { updateSectionTool } from './update-section.js';
import { createLogger } from '../logger.js';
import type { DiffItem, SimilarDiffItem, CvLACSectionName } from '../types.js';

const log = createLogger('sync');

interface SyncOptions {
  dryRun?: boolean;
  sections?: string[];
}

interface SyncResult {
  applied: number;
  skipped: number;
  /** Items left for a human to resolve because CvLAC already holds something similar. */
  needsConfirmation: SimilarDiffItem[];
  errors: string[];
  report: string;
}

function inSections(item: { section: CvLACSectionName }, filter: string[] | null): boolean {
  return !filter || filter.includes(item.section);
}

/**
 * Applies everything the diff considers unambiguous.
 *
 * Items in the `similar` bucket are never written: CvLAC accepts duplicates
 * silently and removing one takes a manual pass through the web UI, so the
 * decision belongs to a human. They are listed in the report instead.
 */
export async function syncTool(opts: SyncOptions = {}): Promise<SyncResult> {
  const { dryRun = false, sections } = opts;
  const filter = sections && sections.length > 0 ? sections : null;

  const diff = await diffTool();

  const missing = diff.missing.filter((d) => inSections(d, filter));
  const toUpdate = diff.toUpdate.filter((d) => inSections(d, filter));
  const similar = diff.similar.filter((d) => inSections(d, filter));
  const upToDate = diff.upToDate.filter((d) => inSections(d, filter));

  const toApply: DiffItem[] = [...missing, ...toUpdate];

  const lines: string[] = ['## CvLAC Sync Report'];
  if (filter) lines.push(`> Secciones: ${filter.join(', ')}`);

  lines.push('', `**Faltantes (${missing.length}):**`);
  lines.push(...missing.map((d) => `- [${d.section}] ${d.label}`));

  lines.push('', `**A actualizar (${toUpdate.length}):**`);
  lines.push(
    ...toUpdate.map((d) => `- [${d.section}] ${d.label}${d.matchedLabel ? ` (en CvLAC: ${d.matchedLabel})` : ''}`)
  );

  lines.push('', `**Requieren decisión — parecidos a ítems ya existentes (${similar.length}):**`);
  lines.push(
    ...similar.flatMap((d) => [
      `- [${d.section}] ${d.label}`,
      ...d.candidates.map((c) => `  - ya en CvLAC: ${c.label}`),
    ])
  );
  if (similar.length > 0) {
    lines.push(
      '  > Resolver uno por uno con update_section: action:"update" para modificar el existente,',
      '  > o action:"add" con confirmDuplicate:true para crearlo igualmente.'
    );
  }

  lines.push('', `**Al día (${upToDate.length}):**`);
  lines.push(...upToDate.map((d) => `- [${d.section}] ${d.label}`));

  if (dryRun) {
    lines.push('', '> Dry run — no se aplicó ningún cambio.');
    return {
      applied: 0,
      skipped: toApply.length,
      needsConfirmation: similar,
      errors: [],
      report: lines.join('\n'),
    };
  }

  log.info('applying sync', { toApply: toApply.length, similar: similar.length });
  lines.push('', '**Cambios aplicados:**');

  const errors: string[] = [];
  let applied = 0;
  let skipped = 0;
  const blocked: SimilarDiffItem[] = [...similar];

  for (const item of toApply) {
    const result = await updateSectionTool({
      section: item.section,
      action: item.action,
      data: item.data,
      // Second line of defence: if the diff missed a duplicate, update_section
      // stops the write rather than creating one.
      confirmDuplicate: false,
    });

    if (result.status === 'needs_confirmation') {
      skipped++;
      blocked.push({ ...item, candidates: result.similar ?? [] });
      lines.push(`- ? ${item.label} — requiere decisión: ${result.message}`);
      continue;
    }

    if (result.success) {
      applied++;
      const warn = result.warnings?.length ? ` (avisos: ${result.warnings.join('; ')})` : '';
      lines.push(`- ✓ ${item.label}${warn}`);
    } else {
      skipped++;
      const warn = result.warnings?.length ? ` | campos: ${result.warnings.join('; ')}` : '';
      errors.push(`${item.label}: ${result.message}${warn}`);
      lines.push(`- ✗ ${item.label} — ${result.message}${warn}`);
    }
  }

  log.info('sync finished', { applied, skipped, blocked: blocked.length });
  return { applied, skipped, needsConfirmation: blocked, errors, report: lines.join('\n') };
}
