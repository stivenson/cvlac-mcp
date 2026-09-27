import { createRequire } from 'module';
import { dirname, join } from 'path';

/**
 * What the process was asked to do. Anything but `serve` runs to completion and
 * exits; `serve` is the MCP server, and the only mode where stdout is the
 * JSON-RPC channel and nothing else may write to it.
 */
export type CliCommand =
  | { kind: 'serve' }
  | { kind: 'install-browser' }
  | { kind: 'version' }
  | { kind: 'help' }
  | { kind: 'unknown'; arg: string };

export function parseArgv(argv: readonly string[]): CliCommand {
  const arg = argv[2]?.trim();
  if (!arg) return { kind: 'serve' };
  if (arg === 'install-browser') return { kind: 'install-browser' };
  if (arg === '--version' || arg === '-v') return { kind: 'version' };
  if (arg === '--help' || arg === '-h' || arg === 'help') return { kind: 'help' };
  return { kind: 'unknown', arg };
}

/**
 * The Playwright CLI that ships *with this install*, not whatever `npx
 * playwright` would fetch.
 *
 * A browser build belongs to one Playwright version: install the browsers with
 * a newer CLI than the library doing the launching and the launch fails with
 * "Executable doesn't exist". Installed through npx the mismatch is easy to hit,
 * because `npx playwright install` resolves to the latest release while this
 * package holds its own pinned one.
 */
export function playwrightCliPath(requireFrom: string = import.meta.url): string {
  const entry = createRequire(requireFrom).resolve('playwright');
  return join(dirname(entry), 'cli.js');
}

export type Runner = (command: string, args: string[]) => number;

/**
 * Downloads Chromium for the pinned Playwright. Returns the exit code so the
 * caller decides what to do with it.
 */
export function installBrowser(run: Runner, cliPath: string = playwrightCliPath()): number {
  return run(process.execPath, [cliPath, 'install', 'chromium']);
}

const MISSING_BROWSER = /Executable doesn't exist|playwright install|browserType\.launch/i;

/**
 * Playwright's own advice is `npx playwright install`, which downloads every
 * browser from the latest release — the slow way to reach the wrong version.
 * Name the command that installs the right build instead.
 */
export function explainLaunchFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!MISSING_BROWSER.test(message)) return message;

  return [
    'No se pudo iniciar Chromium. Falta el navegador que usa este servidor.',
    '',
    'Instálalo con:    npx -y cvlac-mcp install-browser',
    'En Linux, si faltan librerías del sistema:    npx playwright install-deps chromium',
    '',
    'Detalle de Playwright:',
    message,
  ].join('\n');
}

export const HELP = `cvlac-mcp — actualiza tu hoja de vida de CvLAC (MinCiencias) desde el chat de tu editor.

Uso:
  cvlac-mcp                    Arranca el servidor MCP por stdio. Lo invoca tu editor, no tú.
  cvlac-mcp install-browser    Descarga el Chromium que necesita este servidor.
  cvlac-mcp --version          Imprime la versión.
  cvlac-mcp --help             Imprime esta ayuda.

Configuración (variables de entorno):
  CVLAC_NOMBRE, CVLAC_CEDULA, CVLAC_PASSWORD    Credenciales de CvLAC.
  CVLAC_ENV_FILE                                Ruta absoluta al .env que las contiene.
                                                Obligatoria si instalaste con npx.
  CVLAC_SESSION_PATH                            Dónde se cachea la sesión.

Instalación y ejemplos: https://github.com/stivenson/cvlac-mcp#readme
`;
