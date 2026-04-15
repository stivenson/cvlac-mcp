import { readPortfolioTool } from './read-portfolio.js';
import { readCvlacTool } from './read-cvlac.js';
import { computeDiff } from '../diff.js';
import type { CvLACData, CvLACSectionName, DiffResult } from '../types.js';

export async function diffTool(section?: CvLACSectionName | 'all'): Promise<DiffResult> {
  const [portfolio, cvlacPartial] = await Promise.all([
    readPortfolioTool(),
    readCvlacTool(section),
  ]);

  const cvlac: CvLACData = {
    formacion: cvlacPartial.formacion ?? [],
    experiencia: cvlacPartial.experiencia ?? [],
    cursos: cvlacPartial.cursos ?? [],
    reconocimientos: cvlacPartial.reconocimientos ?? [],
  };

  return computeDiff(portfolio, cvlac);
}
