import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createLogger, redact } from '../src/logger.js';

const savedEnv = { ...process.env };
let stderr: string[];
let spy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stderr = [];
  spy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string) => {
    stderr.push(String(chunk));
    return true;
  }) as never);
  delete process.env.CVLAC_LOG_LEVEL;
  delete process.env.CVLAC_LOG_FILE;
});

afterEach(() => {
  spy.mockRestore();
  process.env = { ...savedEnv };
});

describe('redact', () => {
  it('masks password-like keys at any depth', () => {
    expect(
      redact({ user: 'ana', password: 'hunter2', nested: { cvlacPassword: 'x', keep: 1 } })
    ).toEqual({ user: 'ana', password: '***', nested: { cvlacPassword: '***', keep: 1 } });
  });

  it('masks cookies, tokens and stored session state', () => {
    expect(redact({ cookie: 'a', token: 'b', storageState: 'c' })).toEqual({
      cookie: '***',
      token: '***',
      storageState: '***',
    });
  });

  it('masks identity document fields', () => {
    expect(redact({ cedula: '123', nro_documento: '456' })).toEqual({
      cedula: '***',
      nro_documento: '***',
    });
  });

  it('walks arrays', () => {
    expect(redact([{ password: 'x' }, { ok: 'y' }])).toEqual([{ password: '***' }, { ok: 'y' }]);
  });

  it('leaves primitives untouched', () => {
    expect(redact('plain')).toBe('plain');
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBe(null);
  });
});

describe('createLogger', () => {
  it('writes to stderr, never stdout, because stdout carries the MCP protocol', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never);
    createLogger('test').info('hola');
    expect(stderr.join('')).toContain('hola');
    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });

  it('includes the level and the scope', () => {
    createLogger('sesion').warn('cuidado');
    expect(stderr.join('')).toMatch(/WARN\s+\[sesion\] cuidado/);
  });

  it('drops messages below the configured level', () => {
    process.env.CVLAC_LOG_LEVEL = 'warn';
    const log = createLogger('test');
    log.debug('invisible');
    log.info('invisible');
    log.warn('visible');
    const out = stderr.join('');
    expect(out).not.toContain('invisible');
    expect(out).toContain('visible');
  });

  it('falls back to info when the level is not recognised', () => {
    process.env.CVLAC_LOG_LEVEL = 'ruidoso';
    const log = createLogger('test');
    log.debug('invisible');
    log.info('visible');
    const out = stderr.join('');
    expect(out).not.toContain('invisible');
    expect(out).toContain('visible');
  });

  it('redacts context before it reaches the line', () => {
    createLogger('test').error('fallo', { password: 'hunter2', url: 'https://ejemplo' });
    const out = stderr.join('');
    expect(out).not.toContain('hunter2');
    expect(out).toContain('"password":"***"');
    expect(out).toContain('https://ejemplo');
  });

  it('omits the context object when it is empty', () => {
    createLogger('test').info('sin contexto', {});
    expect(stderr.join('').trim()).toMatch(/sin contexto$/);
  });

  it('appends to CVLAC_LOG_FILE when one is configured', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cvlac-log-'));
    const file = join(dir, 'cvlac.log');
    process.env.CVLAC_LOG_FILE = file;
    const log = createLogger('test');
    log.info('primera');
    log.info('segunda');
    const contents = readFileSync(file, 'utf-8');
    expect(contents).toContain('primera');
    expect(contents).toContain('segunda');
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps logging to stderr when the log file cannot be written', () => {
    process.env.CVLAC_LOG_FILE = join(tmpdir(), 'no-existe-dir-cvlac', 'x.log');
    createLogger('test').info('sigue viva');
    expect(stderr.join('')).toContain('sigue viva');
    expect(existsSync(process.env.CVLAC_LOG_FILE!)).toBe(false);
  });
});

describe('silent level', () => {
  it('suppresses every message, which is what the test suite runs with', () => {
    process.env.CVLAC_LOG_LEVEL = 'silent';
    const log = createLogger('test');
    log.debug('a');
    log.info('b');
    log.warn('c');
    log.error('d');
    expect(stderr.join('')).toBe('');
  });
});
