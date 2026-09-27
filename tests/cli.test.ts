import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import {
  parseArgv,
  playwrightCliPath,
  installBrowser,
  explainLaunchFailure,
  HELP,
} from '../src/cli.js';

describe('parseArgv', () => {
  it('serves when the editor starts it with no arguments', () => {
    expect(parseArgv(['node', 'cvlac-mcp'])).toEqual({ kind: 'serve' });
  });

  it('serves when the argument is blank', () => {
    expect(parseArgv(['node', 'cvlac-mcp', '   '])).toEqual({ kind: 'serve' });
  });

  it('recognises install-browser', () => {
    expect(parseArgv(['node', 'cvlac-mcp', 'install-browser'])).toEqual({
      kind: 'install-browser',
    });
  });

  it('recognises both spellings of version and help', () => {
    expect(parseArgv(['node', 'x', '--version']).kind).toBe('version');
    expect(parseArgv(['node', 'x', '-v']).kind).toBe('version');
    expect(parseArgv(['node', 'x', '--help']).kind).toBe('help');
    expect(parseArgv(['node', 'x', '-h']).kind).toBe('help');
    expect(parseArgv(['node', 'x', 'help']).kind).toBe('help');
  });

  it('reports an unknown argument instead of silently serving', () => {
    expect(parseArgv(['node', 'x', 'sync'])).toEqual({ kind: 'unknown', arg: 'sync' });
  });
});

describe('playwrightCliPath', () => {
  it('points at the CLI of the Playwright this package installed', () => {
    const path = playwrightCliPath();
    expect(path.endsWith('cli.js')).toBe(true);
    expect(existsSync(path)).toBe(true);
  });
});

describe('installBrowser', () => {
  it('runs the bundled CLI with this node, and only for chromium', () => {
    const calls: Array<[string, string[]]> = [];
    const code = installBrowser((command, args) => {
      calls.push([command, args]);
      return 0;
    }, '/opt/pw/cli.js');

    expect(code).toBe(0);
    expect(calls).toEqual([[process.execPath, ['/opt/pw/cli.js', 'install', 'chromium']]]);
  });

  it('hands back a failing exit code', () => {
    expect(installBrowser(() => 1, '/opt/pw/cli.js')).toBe(1);
  });
});

describe('explainLaunchFailure', () => {
  it('names the command that installs the matching build', () => {
    const raw = new Error(
      "browserType.launch: Executable doesn't exist at /home/u/.cache/ms-playwright/chromium-1243/chrome"
    );
    const explained = explainLaunchFailure(raw);

    expect(explained).toContain('npx -y cvlac-mcp install-browser');
    expect(explained).toContain('install-deps chromium');
    expect(explained).toContain(raw.message);
  });

  it('leaves an unrelated failure alone', () => {
    expect(explainLaunchFailure(new Error('CvLAC devolvió 503'))).toBe('CvLAC devolvió 503');
  });

  it('survives something thrown that is not an Error', () => {
    expect(explainLaunchFailure('boom')).toBe('boom');
  });
});

describe('HELP', () => {
  it('documents every command the parser accepts', () => {
    expect(HELP).toContain('install-browser');
    expect(HELP).toContain('--version');
    expect(HELP).toContain('CVLAC_ENV_FILE');
  });
});
