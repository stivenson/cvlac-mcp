/**
 * Minimal MCP client for the live suites.
 *
 * Talks to the built server over stdio — the same path the editor uses — so the
 * suite exercises argument validation and JSON serialisation too, not just the
 * tool functions.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function connect({ logFile } = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, 'dist', 'index.js')],
    cwd: ROOT,
    env: { ...process.env, ...(logFile ? { CVLAC_LOG_FILE: logFile, CVLAC_LOG_LEVEL: 'debug' } : {}) },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'cvlac-e2e', version: '0' });
  await client.connect(transport);
  return client;
}

/**
 * Calls a tool and returns its parsed payload, screenshot included.
 *
 * Screenshots are MCP image blocks, not JSON fields. The live runner folds the
 * image back into its private payload so keepScreenshot() can save it next to
 * the report without putting base64 into model context.
 */
export async function call(client, name, args = {}, timeoutMs = 300000) {
  // A write walks a dozen CvLAC pages with human-like pauses; the SDK's 60s
  // default would abort the call while the form is still being filled.
  const res = await client.callTool({ name, arguments: args }, CallToolResultSchema, {
    timeout: timeoutMs,
  });
  const text = (res.content ?? []).find((c) => c.type === 'text')?.text ?? '';
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  const image = (res.content ?? []).find((c) => c.type === 'image');
  if (image?.type === 'image' && data && typeof data === 'object') {
    data.screenshotBase64 = image.data;
  }
  return data;
}
