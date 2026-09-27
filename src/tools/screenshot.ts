import { session } from '../browser/session.js';
import { navigate } from '../browser/navigate.js';
import { isSafeToReload } from '../browser/navigation.js';

export type ScreenshotResult =
  | { kind: 'image'; base64: string; url: string }
  | { kind: 'empty'; message: string };

/**
 * Captures `url`, or the last page a tool visited.
 *
 * Every tool closes its page when it is done, so there is no live "current
 * state" to capture: capturing a fresh page only ever showed about:blank.
 * Reloading the last URL shows what that page holds now.
 */
export async function screenshotTool(url?: string): Promise<ScreenshotResult> {
  const target = url?.trim() || session.lastUrl;
  if (!target) {
    return {
      kind: 'empty',
      message:
        'Todavía no se ha visitado ninguna página de CvLAC en esta sesión. Pasa una url, ' +
        'o llama antes otra tool (read_cvlac, por ejemplo).',
    };
  }
  if (!isSafeToReload(target)) {
    return {
      kind: 'empty',
      message:
        `No abro ${target}: no es una página de lista, ficha o formulario de CvLAC, y en ` +
        'CvLAC abrir un enlace de acción (borrar, guardar) lo ejecuta.',
    };
  }
  await session.login();
  const page = await session.getPage();
  try {
    await navigate(page, target);
    return { kind: 'image', base64: await session.takeScreenshot(page), url: target };
  } finally {
    await page.close();
  }
}
