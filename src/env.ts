import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import * as dotenv from 'dotenv';

/**
 * Which `.env` the server loads at startup.
 *
 * Cloned from git, the file sits next to the server and that is the documented
 * place for it. Installed from npm, the server lives in a cache directory the
 * user never edits — there `CVLAC_ENV_FILE` is the only way to keep credentials
 * out of `mcp.json`, which is world-readable and often synced between machines.
 *
 * An explicit path always wins; a blank one is treated as unset so an empty
 * variable does not silently resolve to the process cwd.
 */
export function resolveEnvFile(
  serverRoot: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const explicit = env.CVLAC_ENV_FILE?.trim();
  return explicit ? explicit : join(serverRoot, '.env');
}

export type EnvEncoding = 'utf8' | 'utf16le' | 'latin1';

/** What loading the `.env` found, kept so a later error can say where it looked. */
export interface EnvFileStatus {
  path: string;
  found: boolean;
  /** Names of the variables the file defined, never their values. */
  keys: string[];
  encoding: EnvEncoding;
}

/**
 * Decodes a `.env` the way Windows editors actually save it.
 *
 * PowerShell 5.1 writes UTF-16LE with `Out-File` and `>`, which dotenv reads as
 * zero variables without complaint; `Set-Content` writes the ANSI code page,
 * which turns "Iván" into "Iv�n" and gets the login rejected. The first shows a
 * byte-order mark; the second is not valid UTF-8, and for the Spanish names this
 * file holds Windows-1252 and latin1 agree.
 */
export function decodeEnvFile(buf: Buffer): { text: string; encoding: EnvEncoding } {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: buf.subarray(2).toString('utf16le'), encoding: 'utf16le' };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'utf8' };
  } catch {
    return { text: buf.toString('latin1'), encoding: 'latin1' };
  }
}

let lastStatus: EnvFileStatus | null = null;

/**
 * Loads `path` into `env` without overriding what is already set, so the
 * editor's config still wins. Records what it found for envFileStatus().
 */
export function loadEnvFile(path: string, env: NodeJS.ProcessEnv = process.env): EnvFileStatus {
  if (!existsSync(path)) {
    lastStatus = { path, found: false, keys: [], encoding: 'utf8' };
    return lastStatus;
  }
  const { text, encoding } = decodeEnvFile(readFileSync(path));
  const parsed = dotenv.parse(text);
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined) env[key] = value;
  }
  lastStatus = { path, found: true, keys: Object.keys(parsed), encoding };
  return lastStatus;
}

export function envFileStatus(): EnvFileStatus | null {
  return lastStatus;
}

/** One stderr line for startup: where the `.env` was, and how it read. */
export function describeEnvFile(status: EnvFileStatus): string {
  if (!status.found) return `env file: ${status.path} (NOT FOUND)`;
  const encoding = status.encoding === 'utf8' ? '' : `, read as ${status.encoding}`;
  return `env file: ${status.path} (found, ${status.keys.length} vars${encoding})`;
}

const CREDENTIALS = ['CVLAC_NOMBRE', 'CVLAC_CEDULA', 'CVLAC_PASSWORD'] as const;

export function missingCredentials(env: NodeJS.ProcessEnv = process.env): string[] {
  return CREDENTIALS.filter((key) => !env[key]?.trim());
}

/**
 * The error for missing credentials, naming what is missing and where it looked.
 * "Set them in .env" alone left people staring at a `.env` they had filled in,
 * when the server had read another path, or read theirs as empty.
 */
export function missingCredentialsMessage(
  missing: string[],
  status: EnvFileStatus | null = lastStatus
): string {
  const head = `Faltan credenciales: ${missing.join(', ')}.`;
  if (!status) {
    return `${head} Defínelas en tu .env y apunta a ese archivo con CVLAC_ENV_FILE en la configuración MCP de tu editor.`;
  }
  if (!status.found) {
    return (
      `${head} Busqué el archivo ${status.path} y no existe. ` +
      'Revisa la ruta de CVLAC_ENV_FILE en la configuración MCP de tu editor ' +
      '(obligatoria si instalaste con npx: el servidor vive en la caché y no tiene .env propio).'
    );
  }
  if (status.keys.length === 0) {
    return `${head} Leí ${status.path}, pero no encontré ninguna variable. Ábrelo y revisa que cada línea sea NOMBRE='valor'.`;
  }
  return `${head} Leí ${status.path} (${status.keys.length} variables), pero no trae esas. Revisa que los nombres estén escritos igual.`;
}
