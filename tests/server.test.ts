import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer, isFailure } from '../src/server.js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { assertAvailable } from '../src/browser/availability.js';

/**
 * Exercises the MCP boundary itself: what a client sees and what the argument
 * validation does before any browser is launched.
 *
 * Only calls that are refused before reaching a tool implementation are made
 * here. Anything the server would actually execute opens Chromium and talks to
 * CvLAC, which this suite must never do.
 */
let client: Client;

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0' });
  await Promise.all([
    client.connect(clientTransport),
    createServer().connect(serverTransport),
  ]);
});

afterAll(async () => {
  await client.close();
});

const EXPECTED = [
  'login',
  'read_cvlac',
  'read_cvlac_detail',
  'read_profile',
  'update_profile',
  'read_portfolio',
  'diff',
  'update_section',
  'sync',
  'screenshot',
  'inspect_form',
  'lookup_doi',
];

describe('tool registration', () => {
  it('exposes exactly the documented tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...EXPECTED].sort());
  });

  it('describes every tool, since the description is all a model has to choose by', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.description!.length, tool.name).toBeGreaterThan(20);
    }
  });

  it('offers the three write actions on update_section', async () => {
    const { tools } = await client.listTools();
    const schema = tools.find((t) => t.name === 'update_section')!.inputSchema as any;
    expect(schema.properties.action.enum.sort()).toEqual(['add', 'delete', 'update']);
    expect(schema.required).toContain('section');
    expect(schema.required).toContain('action');
  });

  it('tells the model how to answer catalogue choices for products', async () => {
    const { tools } = await client.listTools();
    const description = tools.find((tool) => tool.name === 'update_section')?.description ?? '';
    for (const field of ['revistaId', 'libroId', 'editorialId', 'programaId', 'areaId', 'institucionId']) {
      expect(description).toContain(field);
    }
  });

  it('lets read_cvlac and diff address every section plus "all"', async () => {
    const { tools } = await client.listTools();
    for (const name of ['read_cvlac', 'diff']) {
      const schema = tools.find((t) => t.name === name)!.inputSchema as any;
      expect(schema.properties.section.enum, name).toContain('all');
      expect(schema.properties.section.enum, name).toContain('formacion');
      expect(schema.properties.section.enum, name).toContain('eventos');
    }
  });
});

describe('argument validation, before anything reaches CvLAC', () => {
  it('rejects an item whose required field is missing, naming the field', async () => {
    const res: any = await client.callTool({
      name: 'update_section',
      arguments: { section: 'cursos', action: 'add', data: { year: '2026' } },
    });
    const body = JSON.parse(res.content[0].text);
    expect(res.isError).toBe(true);
    expect(body.success).toBe(false);
    expect(body.status).toBe('failed');
    expect(body.message).toContain('cursos');
    expect(body.message).toMatch(/name/i);
  });

  it('rejects an empty name, which would otherwise create a blank CvLAC entry', async () => {
    const res: any = await client.callTool({
      name: 'update_section',
      arguments: { section: 'reconocimientos', action: 'add', data: { name: '' } },
    });
    expect(JSON.parse(res.content[0].text).success).toBe(false);
  });

  // The SDK reports a rejected call as an isError result, not a thrown error.
  // What matters either way is that the tool body never ran.
  it('refuses a section it does not know instead of navigating somewhere unexpected', async () => {
    const res: any = await client.callTool({
      name: 'update_section',
      // A real CvLAC section this server does not drive yet — the point is that
      // the enum, not the tool body, is what turns it away.
      arguments: { section: 'patentes', action: 'add', data: { name: 'x' } },
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/invalid|arguments/i);
  });

  it('refuses an action outside add/update/delete', async () => {
    const res: any = await client.callTool({
      name: 'update_section',
      arguments: { section: 'cursos', action: 'drop', data: { name: 'x' } },
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/invalid|arguments/i);
  });

  it('refuses a call to a tool that does not exist', async () => {
    const res: any = await client.callTool({ name: 'borrar_todo', arguments: {} });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('not found');
  });
});

describe('a tool that fails because CvLAC is down', () => {
  // The point of the typed error is what the person on the other end reads.
  // Verified against a throwaway server so no real tool has to touch the network.
  it('reaches the client as an error carrying the explanation, not a stack trace', async () => {
    const server = new McpServer({ name: 'probe', version: '0' });
    server.registerTool(
      'read_cvlac',
      { description: 'stand-in for a tool whose navigation hits a 503', inputSchema: {} },
      async () => {
        assertAvailable(503, 'https://scienti.minciencias.gov.co/cvlac/EnProyecto/all.do');
        return { content: [{ type: 'text', text: 'unreachable' }] };
      }
    );

    const [ct, st] = InMemoryTransport.createLinkedPair();
    const probe = new Client({ name: 'test', version: '0' });
    await Promise.all([probe.connect(ct), server.connect(st)]);

    const res: any = await probe.callTool({ name: 'read_cvlac', arguments: {} });
    expect(res.isError).toBe(true);
    const text = res.content[0].text as string;
    expect(text).toContain('503');
    expect(text).toMatch(/unavailable/i);
    expect(text).toMatch(/not a problem with your credentials/i);
    expect(text).toMatch(/nothing was read or written/i);

    await probe.close();
  });
});

describe('isFailure', () => {
  // Regression: no tool set isError, so a failed login reached the client as a
  // successful call with "success": false buried in its text.
  it('flags a failed write and a failed login', () => {
    expect(isFailure({ success: false, status: 'failed', message: 'x' })).toBe(true);
    expect(isFailure({ success: false, message: 'Login rechazado' })).toBe(true);
  });

  it('does not flag what asks a person to decide or to look', () => {
    expect(isFailure({ success: false, status: 'needs_confirmation', message: 'x' })).toBe(false);
    expect(isFailure({ success: false, status: 'unverified', message: 'x' })).toBe(false);
    expect(isFailure({ success: true, status: 'ok', message: 'x' })).toBe(false);
    expect(isFailure([{ section: 'cursos' }])).toBe(false);
  });
});

describe('what the server tells a client and a model', () => {
  it('reports the version of the package, not a hard-coded one', () => {
    const { version } = createRequire(import.meta.url)('../package.json') as { version: string };
    expect(client.getServerVersion()?.version).toBe(version);
  });

  // Regression: the sync report told the model to repeat an add with
  // confirmDuplicate:true, a name the tool does not take, so the retry came back
  // needs_confirmation again with no explanation.
  it('names only real parameters when a message says to repeat a call with one', async () => {
    const { tools } = await client.listTools();
    const params = new Set(tools.flatMap((t) => Object.keys((t.inputSchema as any).properties ?? {})));
    const src = join(__dirname, '..', 'src');
    const files = readdirSync(src, { recursive: true }).map(String).filter((f) => f.endsWith('.ts'));
    for (const file of files) {
      const text = readFileSync(join(src, file), 'utf-8');
      for (const [, name] of text.matchAll(/\b(\w+):(?:true|false)\b/g)) {
        expect(params.has(name), `${file}: ${name}`).toBe(true);
      }
    }
  });
});
