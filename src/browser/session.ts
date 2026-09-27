import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { URLS, isSafeToReload } from './navigation.js';
import { createLogger } from '../logger.js';
import { explainLaunchFailure } from '../cli.js';
import { assertAvailable } from './availability.js';
import { missingCredentials, missingCredentialsMessage } from '../env.js';

const log = createLogger('session');

/**
 * Where the authenticated cookies are cached.
 *
 * Read on every use, not at import: ESM evaluates this module before
 * index.ts loads the `.env`, so a module-level constant only ever saw the
 * editor's `env` block and silently ignored the value the README puts in `.env`.
 */
export function sessionPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.CVLAC_SESSION_PATH?.trim();
  return explicit ? explicit : join(homedir(), '.cvlac-session.json');
}

/**
 * The user-agent to present, or undefined to keep Playwright's own.
 *
 * Playwright's matches the Chromium actually running on this system. A fixed
 * string claimed Linux and Chrome 124 from a Windows machine running Chrome 15x,
 * and that mismatch looks more like a bot than any default does.
 */
export function userAgent(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.CVLAC_USER_AGENT?.trim() || undefined;
}

/**
 * CvLAC turned the credentials down. Never retried: every attempt is another
 * failed login against the researcher's real account, and a wrong password does
 * not become right by trying again.
 */
export class LoginRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginRejectedError';
  }
}

/** Random delay between min and max ms to simulate human behaviour */
async function humanDelay(min = 800, max = 2000): Promise<void> {
  const ms = min + Math.random() * (max - min);
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Retry an async operation up to `attempts` times with exponential back-off.
 * A LoginRejectedError is thrown straight through — see its comment.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 5000
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof LoginRejectedError) throw err;
      lastErr = err;
      if (i < attempts - 1) {
        const wait = baseDelayMs * Math.pow(2, i) + Math.random() * 1000;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

/**
 * True when the page is showing the CvLAC login form.
 *
 * CvLAC serves that form *in place* for an unauthenticated request: the URL still
 * reads `.../all.do`, so checking the URL reports a dead session as valid and the
 * caller then scrapes an empty list. The password field is the reliable signal.
 */
export async function isLoginPage(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes('pre_s_login') || url.includes('logOut')) return true;
  return page
    .evaluate(
      () =>
        !!document.querySelector('#txt_contrasena') ||
        !!document.querySelector('input[name="txt_contrasena"]') ||
        !!document.querySelector('form[action*="s_login.do"]')
    )
    .catch(() => false);
}

export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  /** In-flight login, so concurrent callers wait instead of resetting the context under each other. */
  private loginInFlight: Promise<void> | null = null;
  /**
   * The last CvLAC page any tool loaded that is safe to load again. Each tool
   * closes its page when done, so this URL is all `screenshot` has left to show.
   */
  lastUrl: string | null = null;

  async getPage(): Promise<Page> {
    if (!this.context) {
      await this.init();
    }
    const page = await this.context!.newPage();
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame() && isSafeToReload(frame.url())) this.lastUrl = frame.url();
    });
    // Playwright waits 30s for a control by default. When CvLAC serves its
    // outage page instead of a form, every field a filler touches burns that
    // full half minute before reporting the same thing.
    page.setDefaultTimeout(10000);
    return page;
  }

  private async init(): Promise<void> {
    const headless = process.env.CVLAC_HEADLESS !== 'false';
    log.debug('launching browser', { headless });
    try {
      this.browser = await chromium.launch({
        headless,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      });
    } catch (error) {
      // A missing browser is the first wall a fresh install hits, and
      // Playwright's own advice points at the wrong version. See cli.ts.
      throw new Error(explainLaunchFailure(error));
    }

    const path = sessionPath();
    const storageState = existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : undefined;

    this.context = await this.browser.newContext({
      storageState,
      userAgent: userAgent(),
      viewport: { width: 1280, height: 800 },
      locale: 'es-CO',
      timezoneId: 'America/Bogota',
      extraHTTPHeaders: {
        'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
      },
    });

    // Hide webdriver flag
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
  }

  /** Returns true if currently logged in, false if session expired */
  async checkSession(): Promise<boolean> {
    try {
      const page = await this.getPage();
      // Use formacion page — lighter than inicio and still requires auth
      const response = await page.goto(URLS.formacion, { waitUntil: 'domcontentloaded', timeout: 20000 });
      assertAvailable(response?.status() ?? null, URLS.formacion);
      const onLogin = await isLoginPage(page);
      await page.close();
      log.debug('session check', { valid: !onLogin });
      return !onLogin;
    } catch (err) {
      log.debug('session check failed', { error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }

  /**
   * Performs login using credentials from env vars.
   * Saves session to sessionPath() on success.
   * Throws on failure.
   */
  async login(force = false): Promise<void> {
    if (this.loginInFlight) return this.loginInFlight;
    this.loginInFlight = this.doLogin(force).finally(() => {
      this.loginInFlight = null;
    });
    return this.loginInFlight;
  }

  private async doLogin(force: boolean): Promise<void> {
    if (!force) {
      const valid = await this.checkSession();
      if (valid) return;
    }

    const missing = missingCredentials();
    if (missing.length > 0) throw new Error(missingCredentialsMessage(missing));
    const nombre = process.env.CVLAC_NOMBRE!;
    const cedula = process.env.CVLAC_CEDULA!;
    const password = process.env.CVLAC_PASSWORD!;

    log.info('logging in to CvLAC', { force });

    await withRetry(async () => {
      const page = await this.getPage();

      const response = await page.goto(URLS.login, { waitUntil: 'domcontentloaded', timeout: 20000 });
      // Without this the next fill() fails as an opaque selector timeout.
      assertAvailable(response?.status() ?? null, URLS.login);
      await humanDelay(500, 1200);

      // Select nationality — "C" for Colombiana
      await page.selectOption('#tpo_nacionalidad', 'C');
      await humanDelay(300, 700);

      // Fill first name
      await page.fill('#txt_nmes_rh', nombre);
      await humanDelay(200, 500);

      // Fill document number
      await page.fill('#nro_documento_ident', cedula);
      await humanDelay(200, 500);

      // Fill password
      await page.fill('#txt_contrasena', password);
      await humanDelay(400, 900);

      // Submit form
      await page.click('#botonEnviar');

      // Wait for navigation to inicio or an error message
      await page.waitForURL(
        (url) => url.href.includes('inicio') || url.href.includes('error'),
        { timeout: 30000 }
      );

      const currentUrl = page.url();

      // Redirect to inicio.do means login was accepted — save session regardless
      // of whether inicio.do itself is temporarily unavailable (503)
      if (!currentUrl.includes('inicio')) {
        // The page body can echo back submitted credentials, so it is only ever
        // logged at debug level and never put in the thrown message.
        const bodyText = (await page.textContent('body')) ?? '';
        log.debug('login rejected', { snippet: bodyText.slice(0, 200).replace(/\s+/g, ' ') });
        await page.close();
        throw new LoginRejectedError(
          'CvLAC rechazó el inicio de sesión. Revisa CVLAC_NOMBRE (tu primer nombre, tal como ' +
            'lo registraste), CVLAC_CEDULA y CVLAC_PASSWORD en tu .env. No se reintentó, para ' +
            'no bloquear tu cuenta. Con CVLAC_LOG_LEVEL=debug se ve la respuesta de la página.'
        );
      }

      // Persist session
      const state = await this.context!.storageState();
      // Owner-only on POSIX: these cookies open the account without a password.
      // Windows ignores the mode and inherits the profile folder's ACL.
      writeFileSync(sessionPath(), JSON.stringify(state, null, 2), { mode: 0o600 });

      await page.close();

      // Reset context so next getPage() loads fresh cookies from sessionPath()
      await this.context!.close();
      this.context = null;
      log.info('logged in to CvLAC');
    }, 3, 8000);
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
  }

  /** Takes a full-page screenshot and returns base64 PNG */
  async takeScreenshot(page: Page): Promise<string> {
    const buffer = await page.screenshot({ fullPage: true });
    return buffer.toString('base64');
  }
}

// Singleton instance shared across all tool calls in one server process
export const session = new BrowserSession();
