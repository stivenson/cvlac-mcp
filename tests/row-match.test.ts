import { describe, it, expect } from 'vitest';
import { pickRow } from '../src/tools/row-match.js';

describe('pickRow', () => {
  const rows = [
    'Deep learning for crop yield',
    'Deep learning for crop yield in Colombia',
    'Redes neuronales aplicadas',
  ];

  it('takes the exact title even when a longer one contains it', () => {
    expect(pickRow(rows, 'Deep learning for crop yield')).toEqual({ kind: 'one', index: 0 });
  });

  it('ignores case, accents and punctuation', () => {
    expect(pickRow(rows, 'REDES NEURONALES APLICADAS.')).toEqual({ kind: 'one', index: 2 });
  });

  it('takes a partial match only when it is the only one', () => {
    expect(pickRow(rows, 'neuronales aplicadas')).toEqual({ kind: 'one', index: 2 });
  });

  // The old lookup took the first partial match: a delete could hit the neighbour.
  it('refuses to choose between several partial matches', () => {
    expect(pickRow(rows, 'Deep learning')).toEqual({ kind: 'many', labels: [rows[0], rows[1]] });
  });

  it('refuses to choose between two identical rows', () => {
    expect(pickRow(['A', 'A'], 'A')).toEqual({ kind: 'many', labels: ['A', 'A'] });
  });

  it('says none when nothing matches', () => {
    expect(pickRow(rows, 'Otra cosa')).toEqual({ kind: 'none' });
    expect(pickRow(rows, '')).toEqual({ kind: 'none' });
  });
});
