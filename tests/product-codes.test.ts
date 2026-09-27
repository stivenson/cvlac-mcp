import { describe, it, expect } from 'vitest';
import {
  articuloTipo,
  medioPublicacion,
  tesisTipo,
  tesisRol,
  tesisValoracion,
  juradoNivel,
  juradoTrabajo,
  libroPublicacion,
  disponibilidad,
  consultoriaTipo,
  prototipoTipo,
  productoTecnologicoTipo,
} from '../src/tools/products/codes.js';

describe('product codes', () => {
  it.each([
    ['Completo', '111'], ['artículo original', '111'], ['Corto', '112'], ['short communication', '112'],
    ['Revisión', '113'], ['review', '113'], ['Caso clínico', '114'], ['112', '112'],
  ])('articuloTipo(%s) = %s', (text, code) => expect(articuloTipo(text)).toBe(code));

  it.each([
    ['Papel', 'I'], ['impreso', 'I'], ['Electrónico', 'H'], ['online', 'H'], ['web', 'H'],
  ])('medioPublicacion(%s) = %s', (text, code) => expect(medioPublicacion(text)).toBe(code));

  it.each([
    ['Tesis de doctorado', '61'], ['PhD', '61'], ['Maestría', '62'], ['magíster', '62'],
    ['Pregrado', '64'], ['trabajo de grado de pregrado', '64'], ['Especialización', '63'],
    ['Iniciación científica', '65'], ['semillero', '65'], ['Otro', '66'],
  ])('tesisTipo(%s) = %s', (text, code) => expect(tesisTipo(text)).toBe(code));

  it.each([
    ['director', 'O'], ['tutor principal', 'O'], ['codirector', 'C'], ['cotutor', 'C'], ['asesor', 'A'],
  ])('tesisRol(%s) = %s', (text, code) => expect(tesisRol(text)).toBe(code));

  it.each([
    ['Aprobada', '6'], ['meritoria', '5'], ['Distinción laureada', '7'],
  ])('tesisValoracion(%s) = %s', (text, code) => expect(tesisValoracion(text)).toBe(code));

  it.each([
    ['Pregrado', 'A15'], ['Especialización', 'A14'], ['Especialidad médica', 'A16'],
    ['Maestría', 'A11'], ['Doctorado', 'A12'], ['A11', 'A11'],
  ])('juradoNivel(%s) = %s', (text, code) => expect(juradoNivel(text)).toBe(code));

  it.each([
    ['proyecto de grado', 'PG'], ['trabajo de grado', 'TG'], ['tesis', 'TG'], ['examen de calificación', 'ED'],
  ])('juradoTrabajo(%s) = %s', (text, code) => expect(juradoTrabajo(text)).toBe(code));

  it.each([
    ['nacional', 'ED'], ['internacional', 'EI'], ['Book Citation Index', 'BC'],
  ])('libroPublicacion(%s) = %s', (text, code) => expect(libroPublicacion(text)).toBe(code));

  it.each([
    ['restringido', 'Restringido'], ['No restringido', 'No restringido'], ['público', 'No restringido'],
  ])('disponibilidad(%s) = %s', (text, code) => expect(disponibilidad(text)).toBe(code));

  it('maps technical product kinds', () => {
    expect(consultoriaTipo('Servicios de proyectos de IDI')).toBe('241');
    expect(consultoriaTipo('transferencia tecnológica')).toBe('242');
    expect(consultoriaTipo('otro')).toBe('249');
    expect(prototipoTipo('Industrial')).toBe('281');
    expect(prototipoTipo('servicios')).toBe('282');
    expect(productoTecnologicoTipo('base de datos de referencia')).toBe('226');
    expect(productoTecnologicoTipo('otro')).toBe('229');
  });

  it('does not let broad rules shadow narrower ones', () => {
    expect(juradoNivel('especialidad medica')).toBe('A16');
    expect(disponibilidad('no restringido')).toBe('No restringido');
  });

  it('returns null for unrecognised labels', () => {
    expect(articuloTipo('editorial')).toBeNull();
    expect(tesisTipo('')).toBeNull();
    expect(juradoNivel('bachillerato')).toBeNull();
  });
});
