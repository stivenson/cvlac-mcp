import type { ArticleInput } from '../types.js';

export interface CrossrefWork {
  DOI: string;
  type: string;
  title?: string[];
  'container-title'?: string[];
  ISSN?: string[];
  'issn-type'?: Array<{ value: string; type: string }>;
  volume?: string;
  issue?: string;
  page?: string;
  language?: string;
  published?: { 'date-parts': number[][] };
  URL?: string;
}

/** Convert a Crossref work into a draft accepted by update_section. */
export function crossrefToArticle(work: CrossrefWork): ArticleInput {
  if (work.type !== 'journal-article') {
    throw new Error(`el DOI es un "${work.type}", no un journal-article`);
  }
  const [year, month] = work.published?.['date-parts']?.[0] ?? [];
  const [paginaInicial, paginaFinal] = (work.page ?? '').split('-');
  const issn = work['issn-type']?.find((item) => item.type === 'print')?.value ?? work.ISSN?.[0];
  const article: ArticleInput = {
    title: (work.title?.[0] ?? '').trim(),
    year: year ? String(year) : '',
    revista: work['container-title']?.[0],
    doi: work.DOI,
  };
  if (month) article.month = String(month);
  if (issn) article.issn = issn;
  if (work.volume) article.volumen = work.volume;
  if (work.issue) article.fasciculo = work.issue;
  if (paginaInicial) article.paginaInicial = paginaInicial;
  if (paginaFinal) article.paginaFinal = paginaFinal;
  if (work.language) article.idioma = work.language.slice(0, 2).toUpperCase();
  if (work.URL) article.url = work.URL;
  return article;
}

export async function lookupDoi(doi: string): Promise<ArticleInput> {
  const bare = doi.trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '');
  const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(bare)}`, {
    headers: { 'User-Agent': 'cvlac-mcp (https://github.com/stivenson/cvlac-mcp)' },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404) throw new Error(`Crossref no conoce el DOI ${bare}`);
  if (!response.ok) throw new Error(`Crossref respondió ${response.status}`);
  const body = (await response.json()) as { message: CrossrefWork };
  return crossrefToArticle(body.message);
}
