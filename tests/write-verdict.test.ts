import { describe, it, expect } from 'vitest';
import {
  changedFields,
  classifySubmit,
  isOutageMarkup,
  disagreeingFields,
  storedMatchesSubmitted,
  verifiableFields,
  verificationVerdict,
  deleteConfirmation,
  noChangeRefusal,
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


// "I could not read it back" is not "it did not save". A live run reported two
// updates as failed while CvLAC had stored them: the site was down, the reread
// came back empty, and empty was treated as a contradiction.
describe('verificationVerdict', () => {
  it('confirms a write the form now holds', () => {
    expect(verificationVerdict({ nro_ano_obten: '2022' }, { nro_ano_obten: '2022' })).toBe('confirmed');
  });

  it('contradicts a write the form does not hold', () => {
    expect(verificationVerdict({ nro_ano_obten: '2020' }, { nro_ano_obten: '2022' })).toBe('contradicted');
  });

  it('reports an unreadable form as unverifiable, not as a failure', () => {
    expect(verificationVerdict({}, { nro_ano_obten: '2022' })).toBe('unreadable');
  });

  it('treats a form without any of the submitted fields as unreadable', () => {
    expect(verificationVerdict({ cod_rh: '1' }, { nro_ano_obten: '2022' })).toBe('unreadable');
  });

  it('has nothing to check when the filler changed nothing', () => {
    expect(verificationVerdict({ a: '1' }, {})).toBe('unreadable');
  });
});


// Each of these is the readable half of a picker whose hidden code is what the
// form stores, and CvLAC re-renders it its own way: a municipality submitted as
// "Colombia - NORTE DE SANTANDER - CÚCUTA" comes back as "CÚCUTA". Comparing
// them reported three saved updates as failures.
describe('verifiableFields', () => {
  it('drops the display half of a picker', () => {
    expect(verifiableFields({ cod_municipio_text: 'Colombia - X - CÚCUTA', cod_municipio: '991' })).toEqual({
      cod_municipio: '991',
    });
  });

  it('drops the institution and programme captions too', () => {
    expect(
      verifiableFields({
        txt_nme_institucion: 'UNIVERSIDAD X',
        id_institucion: '663',
        txt_nme_programa_acad: 'INGENIERIA',
        cod_rh_prog_acad: '0000000000-14888',
        nme_inst: 'UNIVERSIDAD X',
      })
    ).toEqual({ id_institucion: '663', cod_rh_prog_acad: '0000000000-14888' });
  });

  // The country input of the location picker carries name="null" — CvLAC's own
  // slip. The form does not keep it, so it disagreed with every write.
  it('drops the input CvLAC named "null"', () => {
    expect(verifiableFields({ null: 'COL', cod_municipio: '991' })).toEqual({ cod_municipio: '991' });
  });

  it('keeps ordinary fields', () => {
    expect(verifiableFields({ nro_ano_obten: '2022' })).toEqual({ nro_ano_obten: '2022' });
  });
});

describe('disagreeingFields', () => {
  it('names the field that did not survive, so the message can say which', () => {
    expect(disagreeingFields({ nro_ano: '2024' }, { nro_ano: '2025' })).toEqual(['nro_ano']);
  });

  it('says nothing when everything matches', () => {
    expect(disagreeingFields({ nro_ano: '2025' }, { nro_ano: '2025' })).toEqual([]);
  });

  it('ignores fields the reread does not carry', () => {
    expect(disagreeingFields({ nro_ano: '2025' }, { nro_ano: '2025', otro: 'x' })).toEqual([]);
  });
});

// CvLAC has no undo. A delete that runs on the first ask is one keystroke away
// from removing a real record, so it never does.
describe('deleteConfirmation', () => {
  it('writes nothing and asks first', () => {
    const result = deleteConfirmation('cursos › "Curso de Python"');
    expect(result.success).toBe(false);
    expect(result.status).toBe('needs_confirmation');
  });

  it('names what would be deleted, so the answer is informed', () => {
    expect(deleteConfirmation('cursos › "Curso de Python"').message).toContain('Curso de Python');
  });

  it('says how to go ahead', () => {
    expect(deleteConfirmation('x').message).toContain('confirm_delete');
  });
});

// A submit that leaves the form reads as saved, and it usually is. But a filler
// that silently changed nothing submits the stored values back and gets the very
// same redirect: an idioma whose levels were never touched reported "Updated".
describe('noChangeRefusal', () => {
  it('refuses to call an update that changed no field a success', () => {
    const result = noChangeRefusal('Italiano', []);
    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
  });

  it('names the item, so the message says what did not change', () => {
    expect(noChangeRefusal('Italiano', []).message).toContain('Italiano');
  });

  it('carries the warnings, which is where the reason usually is', () => {
    const result = noChangeRefusal('Italiano', ['sgl_idioma: no se encontró el campo']);
    expect(result.warnings).toEqual(['sgl_idioma: no se encontró el campo']);
  });
});
