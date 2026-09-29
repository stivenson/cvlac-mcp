import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createRequire } from 'module';
import { loginTool } from './tools/login.js';
import { readCvlacTool } from './tools/read-cvlac.js';
import { readCvlacDetailTool } from './tools/read-cvlac-detail.js';
import { readPortfolioTool } from './tools/read-portfolio.js';
import { diffTool } from './tools/diff.js';
import { updateSectionTool } from './tools/update-section.js';
import { syncTool } from './tools/sync.js';
import { screenshotTool } from './tools/screenshot.js';
import { readProfileTool, updateProfileTool, networkNames } from './tools/profile.js';
import { SECTION_SCHEMAS, formatIssues } from './schemas.js';
import { createLogger } from './logger.js';
import { SECTION_NAMES, type CvLACSectionName } from './types.js';
import { lookupDoi } from './tools/crossref.js';
import { completeProductTool, PRODUCT_COMPLETION_SECTIONS } from './tools/complete-product.js';
import type { CompleteProductRequest } from './types.js';
import { isSafeToReload } from './browser/navigation.js';

const log = createLogger('server');

const sectionSchema = z.enum(SECTION_NAMES);
const sectionAllSchema = z.enum([...SECTION_NAMES, 'all'] as [string, ...string[]]);
const productCompletionSectionSchema = z.enum(PRODUCT_COMPLETION_SECTIONS);

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

/**
 * A tool's JSON result, flagged as an error when the tool failed.
 *
 * Without the flag a failed login or a rejected form reached the client as a
 * successful call carrying `"success": false` in its text, and neither the
 * client nor the model had to notice. `needs_confirmation` and `unverified` are
 * not errors: nothing went wrong, a person has to decide or look.
 */
export function jsonResult(result: unknown): {
  content: { type: 'text'; text: string }[];
  isError?: true;
} {
  const content = [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }];
  return isFailure(result) ? { content, isError: true } : { content };
}

/** Keep binary evidence out of the model's JSON context; MCP can carry it as an image block. */
export function jsonResultWithScreenshot(result: unknown): {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: 'image/png' }>;
  isError?: true;
} {
  if (!result || typeof result !== 'object' || typeof (result as { screenshotBase64?: unknown }).screenshotBase64 !== 'string') {
    return jsonResult(result);
  }
  const { screenshotBase64, ...withoutScreenshot } = result as Record<string, unknown>;
  const response = jsonResult(withoutScreenshot);
  return {
    ...response,
    content: [
      ...response.content,
      { type: 'image', data: screenshotBase64 as string, mimeType: 'image/png' },
    ],
  };
}

export function isFailure(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const { status, success } = result as { status?: unknown; success?: unknown };
  if (status !== undefined) return status === 'failed';
  return success === false;
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'cvlac-mcp', version });

  server.registerTool(
    'login',
    {
      description: 'Authenticate in CvLAC and persist the browser session.',
      annotations: { readOnlyHint: false, destructiveHint: false },
      inputSchema: {
        force: z.boolean().optional().describe('Force re-login even if session is valid'),
      },
    },
    async ({ force }) => {
      const result = await loginTool(force ?? false);
      return jsonResult(result);
    }
  );

  server.registerTool(
    'read_cvlac',
    {
      description:
        'Read current CvLAC sections, including articles, books, chapters, theses, juries and five kinds of technical production. ' +
        'Returns existing items for comparison; list results include every JMesa page.',
      annotations: { readOnlyHint: true, destructiveHint: false },
      inputSchema: {
        section: sectionAllSchema
          .optional()
          .describe('Which section to read. Defaults to all.'),
      },
    },
    async ({ section }) => {
      const result = await readCvlacTool(section as CvLACSectionName | 'all');
      return jsonResult(result);
    }
  );

  server.registerTool(
    'read_cvlac_detail',
    {
      description:
        "Read the full record page of one CvLAC item. The list views only show a couple of " +
        "columns, so this is the only way to see the fields a write actually stored " +
        "(role, dates, institution, financing). Finds the row by label, case- and accent-insensitive.",
      annotations: { readOnlyHint: true, destructiveHint: false },
      inputSchema: {
        section: sectionSchema,
        label: z
          .string()
          .describe('Name/title as it appears in the section list, e.g. the degree for formacion'),
      },
    },
    async ({ section, label }) => {
      const result = await readCvlacDetailTool(section as CvLACSectionName, label);
      return jsonResult(result);
    }
  );

  server.registerTool(
    'read_portfolio',
    {
      description:
        'Read and parse the configured portfolio site (PORTFOLIO_URL), merged with the curated proyectos/software/eventos from data/portfolio-extra.json.',
      annotations: { readOnlyHint: true, destructiveHint: false },
      inputSchema: {},
    },
    async () => {
      const result = await readPortfolioTool();
      return jsonResult(result);
    }
  );

  server.registerTool(
    'diff',
    {
      description:
        'Compare CvLAC vs portfolio. Returns four buckets: missing, toUpdate, similar ' +
        '(close to an existing entry — a human decides) and upToDate.',
      annotations: { readOnlyHint: true, destructiveHint: false },
      inputSchema: {
        section: sectionAllSchema
          .optional()
          .describe('Limit diff to a specific section'),
      },
    },
    async ({ section }) => {
      const result = await diffTool(section as CvLACSectionName | 'all');
      return jsonResult(result);
    }
  );

  server.registerTool(
    'update_section',
    {
      description:
        'Apply a single change to a CvLAC section. Takes a screenshot for confirmation. ' +
        'An "add" whose item resembles an existing entry returns status "needs_confirmation" ' +
        'and writes nothing; resolve it with action:"update" or repeat with confirm_duplicate:true. ' +
        'A "delete" also writes nothing until it is repeated with confirm_delete:true. ' +
        'A picker whose search matched several rows — a common university name can match close ' +
        'to 200 institutions in CvLAC — also returns needs_confirmation, with the candidates in ' +
        '"choices"; repeat with the chosen id in data.institucionId. For articles provide title, year and issn/revista; ' +
        'for books provide title, isbn, year, editorial and area; for chapters provide title, bookTitle, year and area; ' +
        'for theses provide title, tipo, year, institution and programme; for juries provide title, nivel, year, ' +
        'orientado, institution and programme; technical sections require title and year, with section-specific fields. ' +
        'Catalogue choices are answered by repeating the call with revistaId, libroId, editorialId, programaId, areaId ' +
        'or institucionId in data. Coauthors, keywords, recognitions and linked thesis students are completed from the CvLAC website.' +
        ' For books, certificateCLCDO and certificateCLRI accept local PDF paths (maximum 2 MiB each).',
      annotations: { readOnlyHint: false, destructiveHint: true },
      inputSchema: {
        section: sectionSchema,
        action: z.enum(['add', 'update', 'delete']),
        data: z.record(z.string(), z.unknown()).describe('The item data to add/update'),
        confirm_duplicate: z
          .boolean()
          .optional()
          .describe('Create the item even though CvLAC already holds a similar one'),
        confirm_delete: z
          .boolean()
          .optional()
          .describe(
            'Required by action:"delete". Without it nothing is removed and the call returns ' +
              'needs_confirmation — CvLAC has no undo.'
          ),
      },
    },
    async ({ section, action, data, confirm_duplicate, confirm_delete }) => {
      // `data` arrives as untyped JSON; validate it here so a bad field is reported
      // as such instead of silently producing an empty CvLAC entry.
      if (action !== 'delete') {
        const parsed = SECTION_SCHEMAS[section as CvLACSectionName].safeParse(data);
        if (!parsed.success) {
          log.warn('update_section rejected invalid data', { section, action });
          return jsonResult({
            success: false,
            status: 'failed',
            message: `Invalid data for section "${section}" — ${formatIssues(parsed.error)}`,
          });
        }
      }

      const result = await updateSectionTool({
        section: section as CvLACSectionName,
        action,
        data,
        confirmDuplicate: confirm_duplicate,
        confirmDelete: confirm_delete,
      });
      return jsonResultWithScreenshot(result);
    }
  );

  server.registerTool(
    'lookup_doi',
    {
      description:
        'Read-only: look up a DOI in Crossref and return an article draft. Review it, then pass it to update_section with section:"articulos"; this tool does not write to CvLAC.',
      annotations: { readOnlyHint: true, destructiveHint: false },
      inputSchema: { doi: z.string().min(1).describe('DOI, doi:... or https://doi.org/...') },
    },
    async ({ doi }) => jsonResult(await lookupDoi(doi))
  );

  server.registerTool(
    'complete_product',
    {
      description:
        'Complete the post-save CvLAC phase for an existing product. It manages ordered keywords, knowledge areas, coauthors and recognitions; ' +
        'for theses it also links students with their participation. It reads current values, resolves catalogue names, and never removes an existing value without confirm_delete:true. ' +
        'Use dry_run:true to preview catalogue resolution and removals without writing.',
      annotations: { readOnlyHint: false, destructiveHint: true },
      inputSchema: {
        section: productCompletionSectionSchema.describe('Product section containing the existing item'),
        label: z.string().min(1).describe('Exact title as shown in the section list'),
        keywords: z
          .array(z.string().min(1))
          .optional()
          .describe('Complete ordered replacement list of product keywords'),
        areas: z
          .array(z.string().min(1))
          .optional()
          .describe('Complete ordered replacement list of product knowledge areas, by code or name'),
        coauthors: z
          .array(z.string().min(1))
          .optional()
          .describe('Complete ordered replacement list of coauthor names; the CvLAC owner is preserved'),
        recognitions: z
          .array(z.string().min(1))
          .optional()
          .describe('Complete ordered replacement list of recognition titles already registered in CvLAC'),
        students: z
          .array(
            z.object({
              name: z.string().min(1),
              participation: z.string().min(1).optional(),
              person_id: z.string().min(1).optional(),
            })
          )
          .optional()
          .describe('Complete thesis student list; each item may use participation TUT, ASE, COT or ORI'),
        dry_run: z.boolean().optional().describe('Preview without creating keywords or submitting lists'),
        confirm_delete: z
          .boolean()
          .optional()
          .describe('Required when the replacement drops existing keywords, areas, coauthors or recognitions, or unlinks thesis students'),
      },
    },
    async ({ section, label, keywords, areas, coauthors, recognitions, students, dry_run, confirm_delete }) => {
      if (
        keywords === undefined &&
        areas === undefined &&
        coauthors === undefined &&
        recognitions === undefined &&
        students === undefined
      ) {
        return jsonResult({
          success: false,
          status: 'failed',
          message: 'Pasa keywords, areas, coauthors, recognitions, students o una combinación; no hay nada que completar.',
        });
      }
      return jsonResultWithScreenshot(
        await completeProductTool({
          section: section as CompleteProductRequest['section'],
          label,
          keywords,
          areas,
          coauthors,
          recognitions,
          students: students?.map((student) => ({
            name: student.name,
            participation: student.participation,
            personId: student.person_id,
          })),
          dryRun: dry_run,
          confirmDelete: confirm_delete,
        })
      );
    }
  );

  server.registerTool(
    'read_profile',
    {
      description:
        "Read the two CvLAC pages that hold one record instead of a list: the researcher " +
        "profile text (txt_desc_perfil), the table of academic social networks " +
        "(Google Scholar, ORCID, LinkedIn, Scopus...) and the áreas de actuación. " +
        "None of them appears in read_cvlac.",
      annotations: { readOnlyHint: true, destructiveHint: false },
      inputSchema: {},
    },
    async () => {
      const result = await readProfileTool();
      return jsonResult(result);
    }
  );

  server.registerTool(
    'update_profile',
    {
      description:
        "Write the researcher profile text and/or the academic social networks. Networks are " +
        "MERGED over what CvLAC already stores — its form rewrites the whole table, so this " +
        "reads it first and posts everything back. Pass url:null to remove one. A network " +
        "CvLAC does not list goes in \"otro\" with its name in \"label\". Removing one needs " +
        "confirm_delete:true. The profile text cannot be blanked: CvLAC marks it required. " +
        "The areas list is replaced whole, so dropping one also needs confirm_delete:true.",
      annotations: { readOnlyHint: false, destructiveHint: true },
      inputSchema: {
        description: z
          .string()
          .optional()
          .describe('Replaces the profile text. Omit to leave it untouched.'),
        networks: z
          .array(
            z.object({
              network: z
                .string()
                .describe(`One of: ${networkNames().join(', ')}`),
              url: z.string().nullable().describe('The profile URL, or null to remove this network'),
              label: z
                .string()
                .optional()
                .describe('Only for network:"otro" — the name CvLAC stores beside the URL'),
            })
          )
          .optional()
          .describe('Networks to set or remove. Everything else stored is kept.'),
        areas: z
          .array(z.string())
          .optional()
          .describe(
            'The whole list of áreas de actuación, in order — the first is the main one — by name ' +
              'or by CvLAC code. It replaces what is stored, so anything left out is a removal. ' +
              'An ambiguous name comes back in "choices" instead of being guessed.'
          ),
        confirm_delete: z
          .boolean()
          .optional()
          .describe(
            'Required when a network carries url:null or the areas list drops one. ' +
              'Without it nothing is written.'
          ),
      },
    },
    async ({ description, networks, areas, confirm_delete }) => {
      const result = await updateProfileTool({
        description,
        networks,
        areas,
        confirmDelete: confirm_delete,
      });
      return jsonResultWithScreenshot(result);
    }
  );

  server.registerTool(
    'sync',
    {
      description:
        'Run a full diff and apply the unambiguous items (missing + toUpdate). Items that ' +
        'resemble existing CvLAC entries are never written; they are listed for a human to ' +
        'resolve. It previews by default; pass dry_run:false to apply changes explicitly.',
      annotations: { readOnlyHint: false, destructiveHint: true },
      inputSchema: {
        dry_run: z
          .boolean()
          .optional()
          .describe('Preview changes without applying them. Defaults to true; use false to write.'),
        sections: z
          .array(sectionSchema)
          .optional()
          .describe('Limit sync to specific sections'),
      },
    },
    async ({ dry_run, sections }) => {
      const result = await syncTool({ dryRun: dry_run ?? true, sections });
      const content = [{ type: 'text' as const, text: result.report }];
      // Partial success is still success; only a run that wrote nothing it tried to is an error.
      return result.errors.length > 0 && result.applied === 0 ? { content, isError: true } : { content };
    }
  );

  server.registerTool(
    'screenshot',
    {
      description:
        'Capture a CvLAC page for debugging: the given url, or else the last list, record or ' +
        'form page a tool visited, reloaded as it is now. Action links (delete, save) are refused, ' +
        'because in CvLAC opening one performs it.',
      annotations: { readOnlyHint: true, destructiveHint: false },
      inputSchema: {
        url: z
          .string()
          .optional()
          .describe('A CvLAC list, record or form page. Defaults to the last one visited.'),
      },
    },
    async ({ url }) => {
      const result = await screenshotTool(url);
      if (result.kind === 'empty') return { content: [{ type: 'text', text: result.message }] };
      return {
        content: [
          { type: 'text', text: result.url },
          { type: 'image', data: result.base64, mimeType: 'image/png' },
        ],
      };
    }
  );

  server.registerTool(
    'inspect_form',
    {
      description: 'Navigate to a CvLAC URL and return the HTML of all form inputs/selects/textareas for debugging field names.',
      annotations: { readOnlyHint: true, destructiveHint: false },
      inputSchema: {
        url: z.string().describe('The CvLAC URL to inspect'),
      },
    },
    async ({ url }) => {
      if (!isSafeToReload(url)) {
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text:
              'inspect_form solo acepta páginas HTTPS de CvLAC que sean listas, fichas o formularios. ' +
              'Se rechazó el destino antes de abrirlo con la sesión autenticada.',
          }],
        };
      }
      const { session } = await import('./browser/session.js');
      await session.login();
      const page = await session.getPage();
      try {
        const { navigate } = await import('./browser/navigate.js');
        await navigate(page, url);
        const fields = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('input, select, textarea, [type="radio"]'));
          return els.map((el) => {
            const e = el as HTMLInputElement;
            const options =
              e.tagName === 'SELECT'
                ? ' options=[' +
                  Array.from((e as unknown as HTMLSelectElement).options)
                    .slice(0, 30)
                    .map((o) => `${o.value}:${o.text.trim()}`)
                    .join(', ') +
                  ']'
                : '';
            const required = e.closest('td,tr')?.textContent?.includes('*') ? ' (*)' : '';
            const sensitive = /password|contrasena|contraseña|cedula|documento|token|secret/i.test(
              `${e.name} ${e.id} ${e.type}`
            );
            const value = sensitive ? '[redacted]' : e.value;
            return `${e.tagName} name="${e.name}" id="${e.id}" type="${e.type}" value="${value}"${required}${options}`;
          });
        });
        const screenshot = await session.takeScreenshot(page);
        return {
          content: [
            { type: 'text', text: fields.join('\n') },
            { type: 'image', data: screenshot, mimeType: 'image/png' },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('inspect_form failed', { url, error: msg });
        const screenshot = await session.takeScreenshot(page).catch(() => null);
        return {
          isError: true,
          content: [
            { type: 'text', text: `inspect_form failed for ${url}: ${msg}` },
            ...(screenshot
              ? [{ type: 'image' as const, data: screenshot, mimeType: 'image/png' as const }]
              : []),
          ],
        };
      } finally {
        await page.close();
      }
    }
  );

  return server;
}
