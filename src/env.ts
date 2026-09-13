import { join } from 'path';

/**
 * Which `.env` the server loads at startup.
 *
 * Cloned from git, the file sits next to the server and that is the documented
 * place for it. Installed from npm, the server lives in a cache directory the
 * user never edits — there `CVLAC_ENV_FILE` is the only way to keep credentials
 * out of `mcp.json`, which is world-readable and often synced between machines.
 *
 * An explicit path always wins; a blank one is treated as unset so an empty
 * variable does not silently resolve to the process cwd.
 */
export function resolveEnvFile(
  serverRoot: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const explicit = env.CVLAC_ENV_FILE?.trim();
  return explicit ? explicit : join(serverRoot, '.env');
}
