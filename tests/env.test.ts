import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { resolveEnvFile } from '../src/env.js';

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
