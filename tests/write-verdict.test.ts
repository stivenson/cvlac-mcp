import { describe, it, expect } from 'vitest';
import {
  changedFields,
  classifySubmit,
  isOutageMarkup,
  storedMatchesSubmitted,
} from '../src/tools/write-verdict.js';

describe('classifySubmit', () => {
  it('trusts a submit that left the form', () => {
    expect(classifySubmit({ landedOnForm: false, errors: [] })).toBe('saved');
  });

  it('rejects a submit the server complained about', () => {
    expect(
      classifySubmit({ landedOnForm: true, errors: ['Seleccione un programa académico'] })
    ).toBe('rejected');
  });

  // CvLAC re-rendered the edit form after saving an experiencia row correctly.
  // Without a complaint from the server there is nothing to call a failure.
  it('calls a silent re-render unverified rather than failed', () => {
    expect(classifySubmit({ landedOnForm: true, errors: [] })).toBe('unverified');
  });

  // Landing away from the form is normally the redirect that follows a save.
  // Landing on MinCiencias' outage page is not, and three updates were reported
  // as saved because of it.
  it('does not read an outage page as a successful redirect', () => {
    expect(classifySubmit({ landedOnForm: false, errors: [], outage: true })).toBe('unverified');
  });

  it('still trusts a redirect when the site is up', () => {
    expect(classifySubmit({ landedOnForm: false, errors: [], outage: false })).toBe('saved');
  });
});

describe('isOutageMarkup', () => {
  it('recognises the page MinCiencias serves when it is down', () => {
    expect(
      isOutageMarkup('<h1>Server Unavailable!</h1><p>Server unavailable.Please visit again later</p>')
    ).toBe(true);
  });

  it('is not fooled by a record that mentions a server', () => {
    expect(isOutageMarkup('<td>Servidor de cálculo para el laboratorio</td>')).toBe(false);
  });

  it('handles an empty page', () => {
    expect(isOutageMarkup('')).toBe(false);
  });
});

describe('storedMatchesSubmitted', () => {
  it('confirms the write when the form now holds what was sent', () => {
    expect(
      storedMatchesSubmitted({ nro_ano_fin: '2021' }, { nro_ano_fin: '2021' })
    ).toBe(true);
  });

  it('denies the write when the form still holds the old value', () => {
    expect(
      storedMatchesSubmitted({ nro_ano_fin: '2020' }, { nro_ano_fin: '2021' })
    ).toBe(false);
  });

  it('ignores fields the form carries but nobody submitted', () => {
    expect(
      storedMatchesSubmitted(
        { nro_ano_fin: '2021', cod_rh: '0001402041' },
        { nro_ano_fin: '2021' }
      )
    ).toBe(true);
  });

  it('ignores surrounding whitespace and case', () => {
    expect(
      storedMatchesSubmitted({ txt_nme_prod: ' Curso DE Prueba ' }, { txt_nme_prod: 'curso de prueba' })
    ).toBe(true);
  });

  it('cannot confirm anything when no submitted field survives on the page', () => {
    expect(storedMatchesSubmitted({ cod_rh: '1' }, { nro_ano_fin: '2021' })).toBe(false);
  });
});

describe('changedFields', () => {
  it('names only what the filler actually changed', () => {
    const before = { nro_ano_fin: '2020', txt_nme: 'Curso' };
    const after = { nro_ano_fin: '2021', txt_nme: 'Curso' };

    expect(changedFields(before, after)).toEqual({ nro_ano_fin: '2021' });
  });

  it('counts a field the form did not have before as changed', () => {
    expect(changedFields({}, { txt_lugar: 'Cúcuta' })).toEqual({ txt_lugar: 'Cúcuta' });
  });

  it('returns nothing when the filler changed nothing', () => {
    expect(changedFields({ a: '1' }, { a: '1' })).toEqual({});
  });
});
