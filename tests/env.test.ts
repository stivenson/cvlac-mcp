import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import {
  resolveEnvFile,
  decodeEnvFile,
  loadEnvFile,
  describeEnvFile,
  missingCredentials,
  missingCredentialsMessage,
} from '../src/env.js';

const ROOT = '/opt/cvlac-mcp';

afterEach(() => {
  delete process.env.CVLAC_ENV_FILE;
});

describe('resolveEnvFile', () => {
  it('falls back to the .env next to the installed server', () => {
    expect(resolveEnvFile(ROOT)).toBe(join(ROOT, '.env'));
  });

  it('prefers CVLAC_ENV_FILE when set', () => {
    expect(resolveEnvFile(ROOT, { CVLAC_ENV_FILE: '/home/u/.config/cvlac.env' })).toBe(
      '/home/u/.config/cvlac.env'
    );
  });

  it('ignores a blank CVLAC_ENV_FILE instead of loading the process cwd', () => {
    expect(resolveEnvFile(ROOT, { CVLAC_ENV_FILE: '   ' })).toBe(join(ROOT, '.env'));
  });

  it('reads process.env when no environment is passed', () => {
    process.env.CVLAC_ENV_FILE = '/tmp/from-process-env';
    expect(resolveEnvFile(ROOT)).toBe('/tmp/from-process-env');
  });
});

const LINES = "CVLAC_NOMBRE='Iván'\nCVLAC_CEDULA=1090123456\nCVLAC_PASSWORD='cl$ve#1'\n";

describe('decodeEnvFile', () => {
  // What PowerShell 5.1 writes with Out-File or `>`. Read as UTF-8, dotenv found
  // no variables at all and the server blamed credentials the user had written.
  it('reads a UTF-16LE file with its byte-order mark', () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(LINES, 'utf16le')]);
    expect(decodeEnvFile(buf)).toEqual({ text: LINES, encoding: 'utf16le' });
  });

  // What Set-Content writes in 5.1: the ANSI code page. "Iván" came out "Iv�n"
  // and CvLAC turned the login down.
  it('falls back to latin1 when the bytes are not UTF-8', () => {
    expect(decodeEnvFile(Buffer.from(LINES, 'latin1'))).toEqual({ text: LINES, encoding: 'latin1' });
  });

  it('reads UTF-8 as UTF-8', () => {
    expect(decodeEnvFile(Buffer.from(LINES, 'utf8'))).toEqual({ text: LINES, encoding: 'utf8' });
  });
});

describe('loadEnvFile', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'cvlac-env-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads a UTF-16 file with accents and quoted symbols intact', () => {
    const path = join(dir, 'utf16.env');
    writeFileSync(path, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(LINES, 'utf16le')]));
    const env: NodeJS.ProcessEnv = {};
    const status = loadEnvFile(path, env);
    expect(env.CVLAC_NOMBRE).toBe('Iván');
    expect(env.CVLAC_PASSWORD).toBe('cl$ve#1');
    expect(status).toEqual({
      path,
      found: true,
      keys: ['CVLAC_NOMBRE', 'CVLAC_CEDULA', 'CVLAC_PASSWORD'],
      encoding: 'utf16le',
    });
  });

  it('never overrides what the editor config already set', () => {
    const path = join(dir, 'plain.env');
    writeFileSync(path, LINES);
    const env: NodeJS.ProcessEnv = { CVLAC_NOMBRE: 'Desde el editor' };
    loadEnvFile(path, env);
    expect(env.CVLAC_NOMBRE).toBe('Desde el editor');
    expect(env.CVLAC_CEDULA).toBe('1090123456');
  });

  it('reports a missing file instead of throwing', () => {
    const path = join(dir, 'no-existe.env');
    expect(loadEnvFile(path, {})).toEqual({ path, found: false, keys: [], encoding: 'utf8' });
  });
});

describe('describeEnvFile', () => {
  it('names the path, the count and an encoding that is not UTF-8, never a value', () => {
    expect(describeEnvFile({ path: '/x/.env', found: true, keys: ['A', 'B'], encoding: 'utf16le' })).toBe(
      'env file: /x/.env (found, 2 vars, read as utf16le)'
    );
    expect(describeEnvFile({ path: '/x/.env', found: false, keys: [], encoding: 'utf8' })).toBe(
      'env file: /x/.env (NOT FOUND)'
    );
  });
});

describe('missing credentials', () => {
  it('lists exactly the ones that are absent or blank', () => {
    expect(missingCredentials({ CVLAC_NOMBRE: 'Ana', CVLAC_CEDULA: '  ' })).toEqual([
      'CVLAC_CEDULA',
      'CVLAC_PASSWORD',
    ]);
  });

  it('says the file it looked for does not exist', () => {
    const msg = missingCredentialsMessage(['CVLAC_PASSWORD'], {
      path: 'C:\\no\\existe\\.env',
      found: false,
      keys: [],
      encoding: 'utf8',
    });
    expect(msg).toContain('CVLAC_PASSWORD');
    expect(msg).toContain('C:\\no\\existe\\.env');
    expect(msg).toContain('no existe');
  });

  it('says the file was read but held no variables', () => {
    const msg = missingCredentialsMessage(['CVLAC_NOMBRE'], {
      path: '/x/.env',
      found: true,
      keys: [],
      encoding: 'utf8',
    });
    expect(msg).toContain('/x/.env');
    expect(msg).toContain('ninguna variable');
  });
});
