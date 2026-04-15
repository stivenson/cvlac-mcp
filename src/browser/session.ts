import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import * as dotenv from 'dotenv';
import { URLS, isLoggedIn } from './navigation.js';

dotenv.config();

const SESSION_PATH =
  process.env.CVLAC_SESSION_PATH ?? join(homedir(), '.cvlac-session.json');

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
    this.browser = await chromium.launch({ headless: true });

    const storageState = existsSync(SESSION_PATH)
      ? JSON.parse(readFileSync(SESSION_PATH, 'utf-8'))
      : undefined;

    this.context = await this.browser.newContext({ storageState });
  }

  /** Returns true if currently logged in, false if session expired */
  async checkSession(): Promise<boolean> {
    try {
      const page = await this.getPage();
      await page.goto(URLS.inicio, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const title = await page.title();
      await page.close();
      return isLoggedIn(title);
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

    const page = await this.getPage();

    await page.goto(URLS.login, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Select nationality — "COL" for Colombiana
    await page.selectOption('#tpo_nacionalidad', 'COL');

    // Fill first name
    await page.fill('#txt_nmes_rh', nombre);

    // Fill document number
    await page.fill('#nro_documento_ident', cedula);

    // Fill password
    await page.fill('#txt_contrasena', password);

    // Submit form
    await page.click('#botonEnviar');

    // Wait for navigation to inicio or an error message
    await page.waitForURL(
      (url) => url.href.includes('inicio') || url.href.includes('error'),
      { timeout: 20000 }
    );

    const currentUrl = page.url();
    if (!currentUrl.includes('inicio')) {
      const bodyText = (await page.textContent('body')) ?? '';
      await page.close();
      throw new Error(`Login failed. Page content: ${bodyText.slice(0, 200)}`);
    }

    // Persist session
    const state = await this.context!.storageState();
    writeFileSync(SESSION_PATH, JSON.stringify(state, null, 2));

    await page.close();
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
