#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { resolveEnvFile, loadEnvFile, describeEnvFile } from './env.js';
import { parseArgv, installBrowser, HELP } from './cli.js';
import { createLogger } from './logger.js';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Everything but `serve` runs to completion here and exits. Only the server
// leaves stdout alone, because there it is the MCP JSON-RPC channel.
const command = parseArgv(process.argv);

if (command.kind === 'install-browser') {
  const code = installBrowser((bin, args) => spawnSync(bin, args, { stdio: 'inherit' }).status ?? 1);
  process.exit(code);
}

if (command.kind === 'version') {
  const pkg = createRequire(import.meta.url)('../package.json') as { version: string };
  console.log(pkg.version);
  process.exit(0);
}

if (command.kind === 'help') {
  console.log(HELP);
  process.exit(0);
}

if (command.kind === 'unknown') {
  console.error(`cvlac-mcp: no conozco el comando "${command.arg}".\n`);
  console.error(HELP);
  process.exit(1);
}

// CVLAC_ENV_FILE if set, otherwise the .env at the project root.
// Only sets vars not already in process.env, so the editor's config still wins.
// Logged after loading, so CVLAC_LOG_LEVEL and CVLAC_LOG_FILE from the file apply.
const envFile = loadEnvFile(resolveEnvFile(join(__dirname, '..')));
const log = createLogger('env');
if (envFile.found && envFile.encoding === 'utf8') log.info(describeEnvFile(envFile));
else log.warn(describeEnvFile(envFile));

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
