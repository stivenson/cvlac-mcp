import { diffTool } from './diff.js';
import { updateSectionTool } from './update-section.js';
import type { DiffItem } from '../types.js';

interface SyncOptions {
  dryRun?: boolean;
  sections?: string[];
}

interface SyncResult {
  applied: number;
  skipped: number;
  errors: string[];
  report: string;
}

export async function syncTool(opts: SyncOptions = {}): Promise<SyncResult> {
  const { dryRun = false, sections } = opts;

  const diff = await diffTool();

  const filterSections = sections && sections.length > 0 ? sections : null;

  const toApply = filterSections
    ? diff.missing.filter((d) => filterSections.includes(d.section))
    : diff.missing;

  const reportMissing = filterSections
    ? diff.missing.filter((d) => filterSections.includes(d.section))
    : diff.missing;

  const reportUpToDate = filterSections
    ? diff.upToDate.filter((d) => filterSections.includes(d.section))
    : diff.upToDate;

  const errors: string[] = [];
  let applied = 0;
  let skipped = 0;

  const reportLines: string[] = [
    `## CvLAC Sync Report`,
    filterSections ? `> Secciones: ${filterSections.join(', ')}` : '',
    ``,
    `**Missing items (${reportMissing.length}):**`,
    ...reportMissing.map((d) => `- [${d.section}] ${d.label}`),
    ``,
    `**Already up to date (${reportUpToDate.length}):**`,
    ...reportUpToDate.map((d) => `- [${d.section}] ${d.label}`),
  ].filter((l) => l !== '');

  if (dryRun) {
    reportLines.push('', '> Dry run — no changes applied.');
    return { applied: 0, skipped: toApply.length, errors: [], report: reportLines.join('\n') };
  }

  reportLines.push('', '**Changes applied:**');

  for (const item of toApply) {
    const result = await updateSectionTool({
      section: item.section,
      action: item.action,
      data: item.data,
    });

    if (result.success) {
      applied++;
      reportLines.push(`- ✓ ${item.label}`);
    } else {
      skipped++;
      errors.push(`${item.label}: ${result.message}`);
      reportLines.push(`- ✗ ${item.label} — ${result.message}`);
    }
  }

  return { applied, skipped, errors, report: reportLines.join('\n') };
}
