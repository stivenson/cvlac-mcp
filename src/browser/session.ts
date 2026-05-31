import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { URLS } from './navigation.js';

const SESSION_PATH =
  process.env.CVLAC_SESSION_PATH ?? join(homedir(), '.cvlac-session.json');

/** Real Chrome 124 user-agent to avoid bot detection */
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Random delay between min and max ms to simulate human behaviour */
async function humanDelay(min = 800, max = 2000): Promise<void> {
  const ms = min + Math.random() * (max - min);
  await new Promise((r) => setTimeout(r, ms));
}

/** Retry an async operation up to `attempts` times with exponential back-off */
async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 5000
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        const wait = baseDelayMs * Math.pow(2, i) + Math.random() * 1000;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async getPage(): Promise<Page> {
    if (!this.context) {
      await this.init();
    }
    return this.context!.newPage();
  }

  private async init(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });

    const storageState = existsSync(SESSION_PATH)
      ? JSON.parse(readFileSync(SESSION_PATH, 'utf-8'))
      : undefined;

    this.context = await this.browser.newContext({
      storageState,
      userAgent: USER_AGENT,
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
      await page.goto(URLS.formacion, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const currentUrl = page.url();
      await page.close();
      // If redirected to login page, session is expired
      if (currentUrl.includes('Login') || currentUrl.includes('logOut')) return false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Performs login using credentials from env vars.
   * Saves session to SESSION_PATH on success.
   * Throws on failure.
   */
  async login(force = false): Promise<void> {
    if (!force) {
      const valid = await this.checkSession();
      if (valid) return;
    }

    const nombre = process.env.CVLAC_NOMBRE;
    const cedula = process.env.CVLAC_CEDULA;
    const password = process.env.CVLAC_PASSWORD;

    if (!nombre || !cedula || !password) {
      throw new Error(
        'Missing credentials. Set CVLAC_NOMBRE, CVLAC_CEDULA, CVLAC_PASSWORD in .env'
      );
    }

    await withRetry(async () => {
      const page = await this.getPage();

      await page.goto(URLS.login, { waitUntil: 'domcontentloaded', timeout: 20000 });
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
        const bodyText = (await page.textContent('body')) ?? '';
        await page.close();
        throw new Error(`Login failed. Page content: ${bodyText.slice(0, 200)}`);
      }

      // Persist session
      const state = await this.context!.storageState();
      writeFileSync(SESSION_PATH, JSON.stringify(state, null, 2));

      await page.close();

      // Reset context so next getPage() loads fresh cookies from SESSION_PATH
      await this.context!.close();
      this.context = null;
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
