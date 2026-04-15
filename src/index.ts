#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import * as dotenv from 'dotenv';

dotenv.config();

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
