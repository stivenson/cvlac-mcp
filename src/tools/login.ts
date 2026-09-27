import { session } from '../browser/session.js';

export async function loginTool(
  force = false
): Promise<{ success: boolean; message: string }> {
  try {
    await session.login(force);
    return { success: true, message: 'Sesión iniciada en CvLAC.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `No se pudo iniciar sesión: ${msg}` };
  }
}
