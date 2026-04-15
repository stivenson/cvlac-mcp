import { fetchPortfolioData } from '../extractors/portfolio.js';
import type { PortfolioData } from '../types.js';

export async function readPortfolioTool(): Promise<PortfolioData> {
  return fetchPortfolioData();
}
