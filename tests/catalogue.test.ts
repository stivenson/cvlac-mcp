import { describe, it, expect } from 'vitest';
import {
  catalogueQuery,
  financingBlockApplies,
  parseProgramaOptions,
  pickPrograma,
  pickMunicipio,
  needsProgramaAcademico,
} from '../src/browser/catalogue.js';

// Shape returned by queryPrograma.do, whitespace and all.
const PROGRAMA_HTML = `
  <select name="select" size="10" style="width:400">
    <option value=''>Seleccione uno</option>
    <option value='0000000000-14886'>
        INGENIERIA CIVIL
    </option>
    <option value='0000000000-14888'>
        INGENIERIA DE SISTEMAS Y COMPUTACION
    </option>
  </select>
`;

describe('parseProgramaOptions', () => {
  it('reads the code and the name of every programme offered', () => {
    expect(parseProgramaOptions(PROGRAMA_HTML)).toEqual([
      { value: '0000000000-14886', label: 'INGENIERIA CIVIL' },
      { value: '0000000000-14888', label: 'INGENIERIA DE SISTEMAS Y COMPUTACION' },
    ]);
  });

  it('drops the empty placeholder option', () => {
    expect(parseProgramaOptions("<option value=''>Seleccione uno</option>")).toEqual([]);
  });

  it('returns nothing when the institution offers no programme at that level', () => {
    expect(parseProgramaOptions('<p>No se encontraron resultados</p>')).toEqual([]);
  });
});

describe('pickPrograma', () => {
  const options = parseProgramaOptions(PROGRAMA_HTML);

  it('matches the degree ignoring case and accents', () => {
    expect(pickPrograma(options, 'Ingeniería Civil')?.value).toBe('0000000000-14886');
  });

  it('accepts CvLAC wording that extends the degree name', () => {
    expect(pickPrograma(options, 'Ingeniería de Sistemas')?.value).toBe('0000000000-14888');
  });

  it('refuses to guess when nothing resembles the degree', () => {
    expect(pickPrograma(options, 'Medicina Veterinaria')).toBeNull();
  });
});

describe('pickMunicipio', () => {
  const items = [
    { id: 827, txtNmeMunicipio: 'CÚCUTA' },
    { id: 974, txtNmeMunicipio: 'BOGOTÁ, D.C.' },
  ];

  it('finds the municipality by name, not by DANE code', () => {
    expect(pickMunicipio(items, 'Cúcuta')?.id).toBe(827);
  });

  it('ignores accents, as the search endpoint does', () => {
    expect(pickMunicipio(items, 'Cucuta')?.id).toBe(827);
  });

  it('refuses a name it cannot find rather than taking the first row', () => {
    expect(pickMunicipio(items, 'Pamplona')).toBeNull();
  });

  it('handles an empty result', () => {
    expect(pickMunicipio([], 'Cúcuta')).toBeNull();
  });
});

describe('needsProgramaAcademico', () => {
  // CvLAC hides the field for school levels and shows it for everything else.
  it.each(['1', '2', '3', '4', '5', 'D', '7', '9', '6', 'X'])('requires it at level %s', (nivel) => {
    expect(needsProgramaAcademico(nivel)).toBe(true);
  });

  it.each(['', 'A', 'B', 'C', 'Z'])('does not require it at level %s', (nivel) => {
    expect(needsProgramaAcademico(nivel)).toBe(false);
  });
});

// CvLAC's JSON endpoints answer in latin1 and match on what they receive, so a
// UTF-8 "Cúcuta" reaches them as "CÃºcuta" and finds nothing. Asking without
// accents finds the row; the accents still matter when picking among results.
describe('catalogueQuery', () => {
  it('drops the accents CvLAC cannot receive', () => {
    expect(catalogueQuery('Cúcuta')).toBe('Cucuta');
    expect(catalogueQuery('Bogotá, D.C.')).toBe('Bogota, D.C.');
  });

  it('leaves a plain name alone', () => {
    expect(catalogueQuery('Pamplona')).toBe('Pamplona');
  });

  it('keeps the ñ, which latin1 does carry', () => {
    expect(catalogueQuery('Muñoz')).toBe('Muñoz');
  });
});

// CvLAC hides the whole "Institución principal del proyecto" block unless the
// project is declared financed. Filling it anyway cost a 30s timeout on a
// hidden field and got the form rejected over a date nobody had asked for.
describe('financingBlockApplies', () => {
  it('applies to a financed project', () => {
    expect(financingBlockApplies('FI')).toBe(true);
  });

  it('does not apply to a solidarity project', () => {
    expect(financingBlockApplies('SO')).toBe(false);
  });

  it('does not apply when the project does not say', () => {
    expect(financingBlockApplies(undefined)).toBe(false);
  });
});
