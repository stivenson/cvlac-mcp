import { describe, it, expect } from 'vitest';
import { BASE_URL, URLS } from '../src/browser/navigation.js';
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

  it('points list URLs at all.do and create URLs at create.do', () => {
    for (const section of sections) {
      expect(new URL(URLS[section as keyof typeof URLS]).pathname, section).toMatch(/\/all\.do$/);
      expect(
        new URL(URLS[`${section}Create` as keyof typeof URLS]).pathname,
        section
      ).toMatch(/\/create\.do$/);
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
