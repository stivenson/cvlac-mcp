import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createLogger } from './logger.js';

const log = createLogger('config');

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Resolved per call so the environment can change between calls (and in tests). */
function configPath(): string {
  return process.env.CVLAC_CONFIG_PATH ?? join(SERVER_ROOT, 'cvlac.config.json');
}

/**
 * Per-user settings that must not live in the source tree.
 *
 * Everything here is optional. A missing value means the corresponding form field
 * is left alone and the caller records a warning — the server never invents a
 * location, institution or workload on the user's behalf.
 */
export interface CvlacConfig {
  /** Portfolio site to read. Overridden by the PORTFOLIO_URL env var. */
  portfolioUrl?: string;
  /**
   * Substring identifying the CV owner in the portfolio bundle. Used to pick the
   * right `{name,title,location}` object when the bundle contains several.
   */
  ownerNamePattern?: string;
  defaults?: {
    /** Municipality for forms that require one (formación, cursos, eventos). */
    municipio?: { nombre: string; codigoDane: string };
    /** Institution used when an item does not name one (proyectos). */
    institucionFallback?: string;
    /** Weekly hours for formación académica. */
    horasSemanales?: number;
    /** Language code for cursos, e.g. 'ES'. */
    idioma?: string;
    /** Country code for cursos, e.g. 'CO'. */
    pais?: string;
  };
}

let cached: CvlacConfig | null = null;

export function loadConfig(): CvlacConfig {
  if (cached) return cached;

  const path = configPath();

  if (!existsSync(path)) {
    log.warn('no config file; personal defaults unavailable', { path });
    cached = {};
    return cached;
  }

  try {
    cached = JSON.parse(readFileSync(path, 'utf-8')) as CvlacConfig;
    log.info('config loaded', { path });
  } catch (err) {
    log.error('config file is not valid JSON; continuing without it', {
      path,
      error: err instanceof Error ? err.message : String(err),
    });
    cached = {};
  }
  return cached;
}

/** Portfolio URL from env, then config. Throws if neither is set. */
export function portfolioUrl(): string {
  const url = process.env.PORTFOLIO_URL ?? loadConfig().portfolioUrl;
  if (!url) {
    throw new Error(
      'No portfolio URL configured. Set PORTFOLIO_URL in .env or portfolioUrl in cvlac.config.json'
    );
  }
  return url.replace(/\/$/, '');
}

/** Only for tests, which need to re-read config after changing the environment. */
export function resetConfigCache(): void {
  cached = null;
}

export { SERVER_ROOT };
