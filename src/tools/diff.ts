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
    proyectos: cvlacPartial.proyectos ?? [],
    software: cvlacPartial.software ?? [],
    eventos: cvlacPartial.eventos ?? [],
    // Neither is diffed: the portfolio carries no languages and no research
    // lines, so every CvLAC row would read as an unexplained extra.
    // Not diffed either: the portfolio's courses map to EnProdCurso, and
    // matching them here as well would report each one missing twice.
    formacionComple: cvlacPartial.formacionComple ?? [],
    idiomas: cvlacPartial.idiomas ?? [],
    lineas: cvlacPartial.lineas ?? [],
  };

  return computeDiff(portfolio, cvlac);
}
