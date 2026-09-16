import { describe, it, expect } from 'vitest';
import {
  catalogueQuery,
  countryOption,
  municipioDisplayName,
  parseDepartamentosXml,
  parseMunicipiosXml,
  pickByName,
  cvlacDateString,
  projectValueApplies,
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
describe('projectValueApplies', () => {
  it('applies to a financed project', () => {
    expect(projectValueApplies('FI')).toBe(true);
  });

  // Only the amount hides on a solidarity project: the administrative act and
  // its date stay on screen, and stay required.
  it('does not apply to a solidarity project', () => {
    expect(projectValueApplies('SO')).toBe(false);
  });

  it('does not apply when the project does not say', () => {
    expect(projectValueApplies(undefined)).toBe(false);
  });
});

// CvLAC's datepicker is set up with dateFormat "yy-mm-dd", which in jQuery UI
// means a four-digit year: 2024-01-01. Sending 01/01/2024 got the project
// rejected for "la fecha del acto administrativo no tiene un formato válido".
describe('cvlacDateString', () => {
  it('keeps a date already written the way CvLAC wants it', () => {
    expect(cvlacDateString('2024-03-09')).toBe('2024-03-09');
  });

  it('turns a day-first date into CvLAC order', () => {
    expect(cvlacDateString('09/03/2024')).toBe('2024-03-09');
  });

  it('pads a single-digit day and month', () => {
    expect(cvlacDateString('9/3/2024')).toBe('2024-03-09');
  });

  it('refuses text it cannot read as a date', () => {
    expect(cvlacDateString('marzo de 2024')).toBeNull();
    expect(cvlacDateString('')).toBeNull();
  });
});

// The popup's cascade, which is the only source of the code the form stores.
const DEPTOS_XML =
  '<departamentos>' +
  '<departamento><id>NA</id><name>NARIÑO</name><pais>COL</pais></departamento>' +
  '<departamento><id>NO</id><name>NORTE DE SANTANDER</name><pais>COL</pais></departamento>' +
  '</departamentos>';

const MUNICIPIOS_XML =
  '<municipios>' +
  '<municipio><id>90811</id><name>No Informado</name><cod_rh>0000000000</cod_rh> </municipio>' +
  '<municipio><id>1030</id><name>VILLA DEL ROSARIO</name><cod_rh>0000000000</cod_rh> </municipio>' +
  '<municipio><id>991</id><name>CÚCUTA</name><cod_rh>0000000000</cod_rh> </municipio>' +
  '</municipios>';

describe('parseDepartamentosXml', () => {
  it('reads the sigla CvLAC asks for by name', () => {
    expect(pickByName(parseDepartamentosXml(DEPTOS_XML), 'NORTE DE SANTANDER')?.id).toBe('NO');
  });

  it('matches a department written without accents', () => {
    expect(pickByName(parseDepartamentosXml(DEPTOS_XML), 'Narino')?.id).toBe('NA');
  });
});

describe('parseMunicipiosXml', () => {
  it('reads the id the form stores, which is none of the other numberings', () => {
    const cucuta = pickByName(parseMunicipiosXml(MUNICIPIOS_XML), 'Cúcuta');
    expect(cucuta?.id).toBe('991');
    expect(cucuta?.codRh).toBe('0000000000');
  });

  it('keeps the accented name, which is what the form displays', () => {
    expect(pickByName(parseMunicipiosXml(MUNICIPIOS_XML), 'Cucuta')?.name).toBe('CÚCUTA');
  });

  it('does not settle for "No Informado" when the name is unknown', () => {
    expect(pickByName(parseMunicipiosXml(MUNICIPIOS_XML), 'Pamplona')).toBeNull();
  });
});

describe('municipioDisplayName', () => {
  it('spells the location the way the picker writes it', () => {
    expect(municipioDisplayName('Colombia', 'NORTE DE SANTANDER', 'CÚCUTA')).toBe(
      'Colombia - NORTE DE SANTANDER - CÚCUTA'
    );
  });

  it('leaves the department out when there is none', () => {
    expect(municipioDisplayName('Colombia', null, 'CÚCUTA')).toBe('Colombia - CÚCUTA');
  });
});

// CvLAC's country selects speak three-letter codes. cvlac.config.json carries
// "CO", which matched no option and left the select untouched for 10s.
describe('countryOption', () => {
  it('turns the two-letter code into the one the select carries', () => {
    expect(countryOption('CO')).toBe('COL');
  });

  it('leaves a three-letter code alone', () => {
    expect(countryOption('COL')).toBe('COL');
    expect(countryOption('ARG')).toBe('ARG');
  });

  it('is case-insensitive', () => {
    expect(countryOption('co')).toBe('COL');
  });

  it('passes through anything it does not know, rather than guessing', () => {
    expect(countryOption('XX')).toBe('XX');
    expect(countryOption(undefined)).toBeUndefined();
  });
});
