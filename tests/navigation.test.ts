import { describe, it, expect } from 'vitest';
import { BASE_URL, URLS, isSafeToReload, isCvLacUrl, toCvLacUrl } from '../src/browser/navigation.js';
import { SECTION_SCHEMAS } from '../src/schemas.js';

const sections = Object.keys(SECTION_SCHEMAS);

describe('URLS', () => {
  it('keeps every entry on the CvLAC host, so a typo cannot send credentials elsewhere', () => {
    for (const [name, url] of Object.entries(URLS)) {
      expect(url, name).toMatch(/^https:\/\/scienti\.minciencias\.gov\.co\//);
      expect(new URL(url).origin, name).toBe(BASE_URL);
    }
  });

  it('builds no double slash in the path, which CvLAC answers with its error page', () => {
    for (const [name, url] of Object.entries(URLS)) {
      expect(new URL(url).pathname, name).not.toMatch(/\/\//);
    }
  });

  it('has a list and a create URL for every section the server accepts', () => {
    for (const section of sections) {
      expect(URLS, `${section} list`).toHaveProperty(section);
      expect(URLS, `${section} create`).toHaveProperty(`${section}Create`);
    }
  });

  // Several CvLAC modules serve more than one kind of product and name the
  // action after it: EnProdTecnica/all_demasTrabajos.do, EnTesisOrientada/
  // all_jurado.do. The suffix is part of the action, not a typo to reject.
  it('points list URLs at all.do and create URLs at create.do', () => {
    for (const section of sections) {
      expect(new URL(URLS[section as keyof typeof URLS]).pathname, section).toMatch(/\/all(_\w+)?\.do$/);
      expect(
        new URL(URLS[`${section}Create` as keyof typeof URLS]).pathname,
        section
      ).toMatch(/\/create(_\w+)?\.do$/);
    }
  });
});

describe('section-specific query strings', () => {
  // docs/cvlac-findings.md: EnProdCurso is courses *taught*. EnFormacionComple is
  // courses *taken* — a different section. Losing __tipo=2B silently lists the wrong one.
  it('reads cursos from EnProdCurso with __tipo=2B, not EnFormacionComple', () => {
    for (const url of [URLS.cursos, URLS.cursosCreate]) {
      expect(url).toContain('/EnProdCurso/');
      expect(url).not.toContain('EnFormacionComple');
      expect(new URL(url).searchParams.get('__tipo')).toBe('2B');
    }
  });

  it('keeps isTrayectoria=TE on both formación URLs', () => {
    for (const url of [URLS.formacion, URLS.formacionCreate]) {
      expect(new URL(url).searchParams.get('isTrayectoria')).toBe('TE');
    }
  });

  it('exposes the login and landing pages the session flow navigates to', () => {
    expect(new URL(URLS.login).pathname).toBe('/cvlac/Login/pre_s_login.do');
    expect(new URL(URLS.inicio).pathname).toBe('/cvlac/EnRecursoHumano/inicio.do');
  });
});

describe('isSafeToReload', () => {
  it('accepts only HTTPS pages on the CvLAC origin', () => {
    expect(isCvLacUrl(`${BASE_URL}/cvlac/EnProyecto/all.do`)).toBe(true);
    expect(isCvLacUrl('https://evil.example/cvlac/EnProyecto/all.do')).toBe(false);
    expect(isCvLacUrl('http://scienti.minciencias.gov.co/cvlac/EnProyecto/all.do')).toBe(false);
    expect(isCvLacUrl('file:///tmp/.env')).toBe(false);
    expect(() => toCvLacUrl('//evil.example/delete.do')).toThrow(/origen permitido/i);
  });

  it('accepts every list and form page the server itself opens', () => {
    for (const [name, url] of Object.entries(URLS)) {
      if (name === 'login') continue;
      expect(isSafeToReload(url), name).toBe(true);
    }
  });

  it('accepts record and edit views', () => {
    expect(isSafeToReload(`${BASE_URL}/cvlac/EnProyecto/edit.do?id=1`)).toBe(true);
    expect(isSafeToReload(`${BASE_URL}/cvlac/EnProyecto/detalle.do?id=1`)).toBe(true);
    expect(isSafeToReload(`${BASE_URL}/cvlac/EnProdTecnica/edit_demasTrabajos.do?id=1`)).toBe(true);
  });

  // Regression: screenshot reloads the last page visited, and a CvLAC delete is a
  // GET. Remembering the delete link would have deleted the next row on a capture.
  it('refuses the links that perform a write', () => {
    for (const action of ['confirmDelete', 'delete', 'insert', 'save', 'update', 'insert_demasTrabajos']) {
      expect(isSafeToReload(`${BASE_URL}/cvlac/EnProyecto/${action}.do?id=1`), action).toBe(false);
    }
  });

  it('refuses what it does not recognise, and what is not a URL', () => {
    expect(isSafeToReload(`${BASE_URL}/cvlac/EnProyecto/confirm.do?id=1`)).toBe(false);
    expect(isSafeToReload('about:blank')).toBe(false);
    expect(isSafeToReload('no es una url')).toBe(false);
    expect(isSafeToReload('https://evil.example/cvlac/EnProyecto/all.do')).toBe(false);
    expect(isSafeToReload('file:///tmp/all.do')).toBe(false);
    expect(isSafeToReload('https://scienti.minciencias.gov.co.evil.example/cvlac/EnProyecto/all.do')).toBe(false);
  });
});
