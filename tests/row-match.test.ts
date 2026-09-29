import { describe, it, expect } from 'vitest';
import { pickRow, exactLabelCount } from '../src/tools/row-match.js';

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

  it('can require an exact title for destructive lookups', () => {
    expect(pickRow(['IA aplicada a cultivos'], 'IA', { exactOnly: true })).toEqual({ kind: 'none' });
  });
});

describe('exactLabelCount', () => {
  const rows = [
    'Deep learning for crop yield',
    'Deep learning for crop yield in Colombia',
    'Redes neuronales aplicadas',
  ];

  it('counts only the exact title, never a row that merely contains it', () => {
    // pickRow would resolve "Deep learning for crop yield" against these same
    // rows just fine (index 0 is the only exact match); exactLabelCount must
    // agree it is exactly one, not two — the longer title is a different record.
    expect(exactLabelCount(rows, 'Deep learning for crop yield')).toBe(1);
  });

  it('ignores case, accents and punctuation like pickRow does', () => {
    expect(exactLabelCount(rows, 'REDES NEURONALES APLICADAS.')).toBe(1);
  });

  it('counts every row sharing the exact same normalized title', () => {
    expect(exactLabelCount(['A', 'A', 'B'], 'A')).toBe(2);
  });

  it('is zero when only a neighbour matches partially', () => {
    expect(exactLabelCount(rows, 'Deep learning')).toBe(0);
  });

  it('is zero for an empty list or an empty label', () => {
    expect(exactLabelCount([], 'A')).toBe(0);
    expect(exactLabelCount(rows, '')).toBe(0);
  });
});
