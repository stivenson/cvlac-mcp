import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
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
import type { CvLACSectionName } from './types.js';

const log = createLogger('server');

const sectionSchema = z.enum(['formacion', 'experiencia', 'cursos', 'reconocimientos', 'proyectos', 'software', 'eventos', 'formacionComple', 'idiomas', 'lineas']);
const sectionAllSchema = z.enum([
  'formacion',
  'experiencia',
  'cursos',
  'reconocimientos',
  'proyectos',
  'software',
  'eventos',
  'formacionComple',
  'idiomas',
  'lineas',
  'all',
]);

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'cvlac-mcp',
    version: '1.0.0',
  });

  server.registerTool(
    'login',
    {
      description: 'Authenticate in CvLAC and persist the browser session.',
      inputSchema: {
        force: z.boolean().optional().describe('Force re-login even if session is valid'),
      },
    },
    async ({ force }) => {
      const result = await loginTool(force ?? false);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    'read_cvlac',
    {
      description: 'Read current CvLAC sections. Returns existing items for comparison.',
      inputSchema: {
        section: sectionAllSchema
          .optional()
          .describe('Which section to read. Defaults to all.'),
      },
    },
    async ({ section }) => {
      const result = await readCvlacTool(section as CvLACSectionName | 'all');
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    'read_cvlac_detail',
    {
      description:
        "Read the full record page of one CvLAC item. The list views only show a couple of " +
        "columns, so this is the only way to see the fields a write actually stored " +
        "(role, dates, institution, financing). Finds the row by label, case- and accent-insensitive.",
      inputSchema: {
        section: sectionSchema,
        label: z
          .string()
          .describe('Name/title as it appears in the section list, e.g. the degree for formacion'),
      },
    },
    async ({ section, label }) => {
      const result = await readCvlacDetailTool(section as CvLACSectionName, label);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    'read_portfolio',
    {
      description:
        'Read and parse the configured portfolio site (PORTFOLIO_URL), merged with the curated proyectos/software/eventos from data/portfolio-extra.json.',
      inputSchema: {},
    },
    async () => {
      const result = await readPortfolioTool();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    'diff',
    {
      description:
        'Compare CvLAC vs portfolio. Returns four buckets: missing, toUpdate, similar ' +
        '(close to an existing entry — a human decides) and upToDate.',
      inputSchema: {
        section: sectionAllSchema
          .optional()
          .describe('Limit diff to a specific section'),
      },
    },
    async ({ section }) => {
      const result = await diffTool(section as CvLACSectionName | 'all');
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    'update_section',
    {
      description:
        'Apply a single change to a CvLAC section. Takes a screenshot for confirmation. ' +
        'An "add" whose item resembles an existing entry returns status "needs_confirmation" ' +
        'and writes nothing; resolve it with action:"update" or repeat with confirm_duplicate:true. ' +
        'A "delete" also writes nothing until it is repeated with confirm_delete:true.',
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
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    status: 'failed',
                    message: `Invalid data for section "${section}" — ${formatIssues(parsed.error)}`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
      }

      const result = await updateSectionTool({
        section: section as CvLACSectionName,
        action,
        data,
        confirmDuplicate: confirm_duplicate,
        confirmDelete: confirm_delete,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    'read_profile',
    {
      description:
        "Read the two CvLAC pages that hold one record instead of a list: the researcher " +
        "profile text (txt_desc_perfil) and the table of academic social networks " +
        "(Google Scholar, ORCID, LinkedIn, Scopus...). Neither appears in read_cvlac.",
      inputSchema: {},
    },
    async () => {
      const result = await readProfileTool();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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
        "confirm_delete:true. The profile text cannot be blanked: CvLAC marks it required.",
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
        confirm_delete: z
          .boolean()
          .optional()
          .describe('Required when any network carries url:null. Without it nothing is written.'),
      },
    },
    async ({ description, networks, confirm_delete }) => {
      const result = await updateProfileTool({ description, networks, confirmDelete: confirm_delete });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    'sync',
    {
      description:
        'Run a full diff and apply the unambiguous items (missing + toUpdate). Items that ' +
        'resemble existing CvLAC entries are never written; they are listed for a human to ' +
        'resolve. Use dry_run:true to preview.',
      inputSchema: {
        dry_run: z
          .boolean()
          .optional()
          .describe('Preview changes without applying them'),
        sections: z
          .array(sectionSchema)
          .optional()
          .describe('Limit sync to specific sections'),
      },
    },
    async ({ dry_run, sections }) => {
      const result = await syncTool({ dryRun: dry_run, sections });
      return { content: [{ type: 'text', text: result.report }] };
    }
  );

  server.registerTool(
    'screenshot',
    {
      description: 'Take a screenshot of the current browser state for debugging.',
      inputSchema: {},
    },
    async () => {
      const result = await screenshotTool();
      return {
        content: [{ type: 'image', data: result.base64, mimeType: 'image/png' }],
      };
    }
  );

  server.registerTool(
    'inspect_form',
    {
      description: 'Navigate to a CvLAC URL and return the HTML of all form inputs/selects/textareas for debugging field names.',
      inputSchema: {
        url: z.string().describe('The CvLAC URL to inspect'),
      },
    },
    async ({ url }) => {
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
            return `${e.tagName} name="${e.name}" id="${e.id}" type="${e.type}" value="${e.value}"${required}${options}`;
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
