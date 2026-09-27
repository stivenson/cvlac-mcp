#!/usr/bin/env node
/**
 * Install smoke test: does the packaged server work on this machine?
 *
 * Exists because the three things most likely to break on an operating system
 * nobody developed on are not covered by the unit suite: the executable bit and
 * the shebang, whether the process speaks MCP over stdio at all, and whether a
 * fresh install fails with an error a person can act on. It touches no network
 * and needs no credentials, so it is safe to run anywhere, including CI.
 *
 *   node scripts/smoke.mjs                       # the local dist/
 *   node scripts/smoke.mjs --entry path/index.js # an installed copy
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const entryArg = process.argv.find((a) => a.startsWith('--entry='));
const ENTRY = entryArg ? resolve(entryArg.slice('--entry='.length)) : join(ROOT, 'dist', 'index.js');

const EXPECTED_TOOLS = [
  'login',
  'read_cvlac',
  'read_cvlac_detail',
  'read_portfolio',
  'diff',
  'update_section',
  'sync',
];

let failures = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  ok    ${name}`))
    .catch((error) => {
      failures += 1;
      console.log(`  FAIL  ${name}`);
      console.log(`        ${error.message.split('\n').join('\n        ')}`);
    });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(...args) {
  // Always through this node, never through a shell: `npx` is a .cmd on Windows
  // and would need one, which changes how arguments are quoted.
  return spawnSync(process.execPath, [ENTRY, ...args], { encoding: 'utf-8' });
}

console.log(`smoke: ${ENTRY}\n`);

await check('--version prints a version', () => {
  const { status, stdout } = run('--version');
  assert(status === 0, `exit ${status}`);
  assert(/^\d+\.\d+\.\d+/.test(stdout.trim()), `not a version: ${stdout.trim()}`);
});

await check('--help names the browser installer', () => {
  const { status, stdout } = run('--help');
  assert(status === 0, `exit ${status}`);
  assert(stdout.includes('install-browser'), 'help does not mention install-browser');
  assert(stdout.includes('CVLAC_ENV_FILE'), 'help does not mention CVLAC_ENV_FILE');
});

await check('an unknown command fails loudly', () => {
  const { status, stderr } = run('sincronizar');
  assert(status === 1, `exit ${status}, expected 1`);
  assert(stderr.includes('sincronizar'), 'the error does not name the argument');
});

let client;
await check('the server speaks MCP over stdio', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [ENTRY],
    // A blank path, so a .env on the CI machine cannot change the outcome.
    env: { ...process.env, CVLAC_ENV_FILE: join(ROOT, 'no-such.env') },
    stderr: 'ignore',
  });
  client = new Client({ name: 'cvlac-smoke', version: '0' });
  await client.connect(transport);
});

await check('every expected tool is registered', async () => {
  assert(client, 'no connection');
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  const missing = EXPECTED_TOOLS.filter((t) => !names.includes(t));
  assert(missing.length === 0, `missing: ${missing.join(', ')}`);
});

await check('login without credentials explains itself, without a browser', async () => {
  assert(client, 'no connection');
  const res = await client.callTool(
    { name: 'login', arguments: {} },
    CallToolResultSchema,
    { timeout: 30000 }
  );
  const text = (res.content ?? []).find((c) => c.type === 'text')?.text ?? '';
  assert(/credenciales/i.test(text), `unexpected answer: ${text.slice(0, 200)}`);
  assert(text.includes('CVLAC_ENV_FILE'), 'the error does not point at CVLAC_ENV_FILE');
});

await client?.close().catch(() => {});

// Opt-in: proves the browser this install downloaded actually launches on this
// operating system. Skipped by default because it needs ~150 MB on disk.
if (process.argv.includes('--browser')) {
  await check('the installed Chromium launches', async () => {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent('<h1>ok</h1>');
    assert((await page.textContent('h1')) === 'ok', 'the page did not render');
    await browser.close();
  });
}

console.log(failures === 0 ? '\nsmoke: todo bien' : `\nsmoke: ${failures} fallo(s)`);
process.exit(failures === 0 ? 0 : 1);
