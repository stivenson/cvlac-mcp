import { describe, it, expect } from 'vitest';
import { parseStatusBar, pagedListUrl, MAX_ROWS } from '../src/browser/jmesa.js';

describe('parseStatusBar', () => {
  it('reads the range and the total', () => {
    expect(parseStatusBar('Resultados 1 - 9 de 9.')).toEqual({ from: 1, to: 9, total: 9 });
    expect(parseStatusBar('  Resultados 16 - 30 de 212. ')).toEqual({ from: 16, to: 30, total: 212 });
  });

  // An empty list shows "Ningún dato disponible" and no status bar at all.
  it('returns null when there is no status bar', () => {
    expect(parseStatusBar(undefined)).toBeNull();
    expect(parseStatusBar('Ningún dato disponible en esta tabla')).toBeNull();
  });
});

describe('pagedListUrl', () => {
  it('keeps the list parameters and adds the table paging', () => {
    const url = new URL(
      pagedListUrl('https://x/cvlac/EnProdCurso/all.do?__tipo=2B', 'cursos_dictados_all', 2)
    );
    expect(url.searchParams.get('__tipo')).toBe('2B');
    expect(url.searchParams.get('cursos_dictados_all_mr_')).toBe(String(MAX_ROWS));
    expect(url.searchParams.get('cursos_dictados_all_p_')).toBe('2');
  });

  it('works on a list URL without a query', () => {
    expect(pagedListUrl('https://x/cvlac/EnLibro/all.do', 't', 1)).toBe(
      'https://x/cvlac/EnLibro/all.do?t_mr_=100&t_p_=1'
    );
  });
});
