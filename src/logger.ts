import { appendFileSync } from 'fs';

/**
 * Logging for an MCP stdio server.
 *
 * stdout carries the JSON-RPC protocol, so every log line goes to stderr.
 * Writing to stdout here would corrupt the transport.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function configuredLevel(): LogLevel {
  const raw = (process.env.CVLAC_LOG_LEVEL ?? 'info').toLowerCase();
  return raw in LEVEL_ORDER ? (raw as LogLevel) : 'info';
}

const SECRET_KEY = /password|contrasena|contraseña|cedula|documento|cookie|token|storagestate|secret/i;

/**
 * Replaces values of secret-looking keys with '***' before they reach a log line.
 * Recurses through plain objects and arrays; leaves other values untouched.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY.test(k) ? '***' : redact(v, depth + 1);
  }
  return out;
}

let fileLoggingBroken = false;

function emit(level: LogLevel, scope: string, message: string, ctx?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredLevel()]) return;

  const parts = [new Date().toISOString(), level.toUpperCase().padEnd(5), `[${scope}]`, message];
  if (ctx && Object.keys(ctx).length > 0) parts.push(JSON.stringify(redact(ctx)));
  const line = parts.join(' ');

  process.stderr.write(line + '\n');

  const file = process.env.CVLAC_LOG_FILE;
  if (file && !fileLoggingBroken) {
    try {
      appendFileSync(file, line + '\n');
    } catch {
      fileLoggingBroken = true;
      process.stderr.write(
        `${new Date().toISOString()} WARN  [logger] CVLAC_LOG_FILE not writable; stderr only\n`
      );
    }
  }
}

export interface Logger {
  debug(message: string, ctx?: Record<string, unknown>): void;
  info(message: string, ctx?: Record<string, unknown>): void;
  warn(message: string, ctx?: Record<string, unknown>): void;
  error(message: string, ctx?: Record<string, unknown>): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, c) => emit('debug', scope, m, c),
    info: (m, c) => emit('info', scope, m, c),
    warn: (m, c) => emit('warn', scope, m, c),
    error: (m, c) => emit('error', scope, m, c),
  };
}
