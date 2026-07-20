import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadConfig, portfolioUrl, resetConfigCache } from '../src/config.js';

let dir: string;
const savedEnv = { ...process.env };

function writeConfig(contents: unknown | string): string {
  const path = join(dir, 'cvlac.config.json');
  writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents));
  return path;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cvlac-config-'));
  resetConfigCache();
  delete process.env.CVLAC_CONFIG_PATH;
  delete process.env.PORTFOLIO_URL;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  process.env = { ...savedEnv };
  resetConfigCache();
});

describe('loadConfig', () => {
  it('reads the file named by CVLAC_CONFIG_PATH', () => {
    process.env.CVLAC_CONFIG_PATH = writeConfig({
      ownerNamePattern: 'Ana',
      defaults: { municipio: { nombre: 'Bogotá', codigoDane: '11001' }, horasSemanales: 4 },
    });
    const cfg = loadConfig();
    expect(cfg.ownerNamePattern).toBe('Ana');
    expect(cfg.defaults?.municipio?.codigoDane).toBe('11001');
    expect(cfg.defaults?.horasSemanales).toBe(4);
  });

  it('returns an empty config when the file does not exist, so the server still starts', () => {
    process.env.CVLAC_CONFIG_PATH = join(dir, 'no-existe.json');
    expect(loadConfig()).toEqual({});
  });

  it('returns an empty config for malformed JSON instead of crashing', () => {
    process.env.CVLAC_CONFIG_PATH = writeConfig('{ esto no es json');
    expect(loadConfig()).toEqual({});
  });

  it('caches the file so repeated lookups do not re-read it', () => {
    const path = writeConfig({ ownerNamePattern: 'Ana' });
    process.env.CVLAC_CONFIG_PATH = path;
    expect(loadConfig().ownerNamePattern).toBe('Ana');
    writeFileSync(path, JSON.stringify({ ownerNamePattern: 'Otro' }));
    expect(loadConfig().ownerNamePattern).toBe('Ana');
    resetConfigCache();
    expect(loadConfig().ownerNamePattern).toBe('Otro');
  });
});

describe('portfolioUrl', () => {
  it('prefers PORTFOLIO_URL over the config file', () => {
    process.env.CVLAC_CONFIG_PATH = writeConfig({ portfolioUrl: 'https://config.example' });
    process.env.PORTFOLIO_URL = 'https://env.example';
    expect(portfolioUrl()).toBe('https://env.example');
  });

  it('falls back to the config file', () => {
    process.env.CVLAC_CONFIG_PATH = writeConfig({ portfolioUrl: 'https://config.example' });
    expect(portfolioUrl()).toBe('https://config.example');
  });

  it('strips a trailing slash so bundle URLs resolve consistently', () => {
    process.env.PORTFOLIO_URL = 'https://env.example/';
    expect(portfolioUrl()).toBe('https://env.example');
  });

  it('throws a message naming both ways to set it when neither is configured', () => {
    process.env.CVLAC_CONFIG_PATH = join(dir, 'no-existe.json');
    expect(() => portfolioUrl()).toThrow(/PORTFOLIO_URL.*cvlac\.config\.json/s);
  });
});
