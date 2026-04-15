import { session } from '../browser/session.js';
import { extractFormacion } from '../extractors/cvlac/formacion.js';
import { extractExperiencia } from '../extractors/cvlac/experiencia.js';
import { extractCursos } from '../extractors/cvlac/cursos.js';
import { extractReconocimientos } from '../extractors/cvlac/reconocimientos.js';
import type { CvLACData, CvLACSectionName } from '../types.js';

export async function readCvlacTool(
  section?: CvLACSectionName | 'all'
): Promise<Partial<CvLACData>> {
  await session.login();

  const page = await session.getPage();
  const target = section ?? 'all';
  const result: Partial<CvLACData> = {};

  if (target === 'formacion' || target === 'all') {
    result.formacion = await extractFormacion(page);
  }
  if (target === 'experiencia' || target === 'all') {
    result.experiencia = await extractExperiencia(page);
  }
  if (target === 'cursos' || target === 'all') {
    result.cursos = await extractCursos(page);
  }
  if (target === 'reconocimientos' || target === 'all') {
    result.reconocimientos = await extractReconocimientos(page);
  }

  await page.close();
  return result;
}
