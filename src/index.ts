#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load .env from project root — only sets vars not already in process.env
dotenv.config({ path: join(__dirname, '..', '.env'), override: false });

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
