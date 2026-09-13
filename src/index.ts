#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { resolveEnvFile } from './env.js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// CVLAC_ENV_FILE if set, otherwise the .env at the project root.
// Only sets vars not already in process.env, so the editor's config still wins.
// `quiet` matters: dotenv writes its banner to stdout, which here is the MCP
// JSON-RPC channel — an unsilenced tip is malformed protocol traffic.
dotenv.config({ path: resolveEnvFile(join(__dirname, '..')), override: false, quiet: true });

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
