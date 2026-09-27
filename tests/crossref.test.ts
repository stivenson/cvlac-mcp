import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crossrefToArticle } from '../src/tools/crossref.js';

const fixture = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'crossref', 'work.json'), 'utf8')
);

describe('crossrefToArticle', () => {
  it('maps a journal article to update_section input', () => {
    expect(crossrefToArticle(fixture.message)).toEqual({
      title: 'Un artículo de ejemplo sobre visión por computador',
      year: '2024', month: '11', issn: '0120-5609', revista: 'Revista de Ejemplo',
      volumen: '44', fasciculo: '2', paginaInicial: '10', paginaFinal: '25', idioma: 'ES',
      doi: '10.1234/ejemplo.2024.001', url: 'https://doi.org/10.1234/ejemplo.2024.001',
    });
  });

  it('refuses a non-journal DOI', () => {
    expect(() => crossrefToArticle({ ...fixture.message, type: 'book-chapter' })).toThrow(/journal-article/);
  });
});
