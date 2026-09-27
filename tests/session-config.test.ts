import { describe, it, expect } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';
import { withRetry, LoginRejectedError, sessionPath, userAgent } from '../src/browser/session.js';

describe('withRetry', () => {
  // Regression: the "login rejected" error was thrown inside the retry, so one
  // wrong password was submitted three times against the researcher's account.
  it('submits a rejected login once and gives up', async () => {
    let calls = 0;
    const attempt = withRetry(async () => {
      calls++;
      throw new LoginRejectedError('rechazado');
    }, 3, 1);
    await expect(attempt).rejects.toBeInstanceOf(LoginRejectedError);
    expect(calls).toBe(1);
  });

  it('still retries a failure that is not a rejection', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('timeout');
      return 'ok';
    }, 3, 1);
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });
});

// Regression: both were module-level constants, evaluated before index.ts had
// loaded the .env, so the values the README puts there were silently ignored.
describe('settings read at use, not at import', () => {
  it('takes CVLAC_SESSION_PATH as it is when asked', () => {
    expect(sessionPath({ CVLAC_SESSION_PATH: '/tmp/s.json' })).toBe('/tmp/s.json');
    expect(sessionPath({})).toBe(join(homedir(), '.cvlac-session.json'));
    expect(sessionPath({ CVLAC_SESSION_PATH: '  ' })).toBe(join(homedir(), '.cvlac-session.json'));
  });

  it('sees a value set after the module loaded', () => {
    const before = process.env.CVLAC_SESSION_PATH;
    process.env.CVLAC_SESSION_PATH = '/tmp/despues.json';
    try {
      expect(sessionPath()).toBe('/tmp/despues.json');
    } finally {
      if (before === undefined) delete process.env.CVLAC_SESSION_PATH;
      else process.env.CVLAC_SESSION_PATH = before;
    }
  });

  // Undefined leaves Playwright's own, which matches the browser really running.
  it('sends no user-agent of its own unless one is configured', () => {
    expect(userAgent({})).toBeUndefined();
    expect(userAgent({ CVLAC_USER_AGENT: 'Mozilla/5.0 test' })).toBe('Mozilla/5.0 test');
  });
});
