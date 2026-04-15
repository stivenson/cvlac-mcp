import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loginTool } from './tools/login.js';
import { readCvlacTool } from './tools/read-cvlac.js';
import { readPortfolioTool } from './tools/read-portfolio.js';
import { diffTool } from './tools/diff.js';
import { updateSectionTool } from './tools/update-section.js';
import { syncTool } from './tools/sync.js';
import { screenshotTool } from './tools/screenshot.js';
import type { CvLACSectionName } from './types.js';

const sectionSchema = z.enum(['formacion', 'experiencia', 'cursos', 'reconocimientos']);
const sectionAllSchema = z.enum([
  'formacion',
  'experiencia',
  'cursos',
  'reconocimientos',
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
    'read_portfolio',
    {
      description: 'Read and parse stivenson.github.io portfolio data.',
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
        'Compare CvLAC vs portfolio. Returns missing items and items already up to date.',
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
        'Apply a single update to a CvLAC section. Takes a screenshot for confirmation.',
      inputSchema: {
        section: sectionSchema,
        action: z.enum(['add', 'update', 'delete']),
        data: z.record(z.string(), z.unknown()).describe('The item data to add/update'),
      },
    },
    async ({ section, action, data }) => {
      const result = await updateSectionTool({
        section: section as CvLACSectionName,
        action,
        data,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    'sync',
    {
      description:
        'Run a full diff and apply all missing items. Use dry_run:true to preview without changes.',
      inputSchema: {
        dry_run: z
          .boolean()
          .optional()
          .describe('Preview changes without applying them'),
        sections: z
          .array(z.string())
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

  return server;
}
