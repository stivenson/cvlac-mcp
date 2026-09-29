/**
 * Which list row a label means, or that it cannot be told.
 *
 * Product lists are full of near-identical titles — a paper and its extended
 * version, a chapter and the book it sits in. The lookup used to take the first
 * row whose text contained the label, so an update or a delete could land on
 * the neighbour. Now an exact title wins, a partial one only counts alone, and
 * anything else goes back to a person.
 */

export type RowPick = { kind: 'one'; index: number } | { kind: 'many'; labels: string[] } | { kind: 'none' };

/** Lowercase, unaccented, punctuation-stripped — shared by every exact/partial comparison here. */
export const normalizeLabel = (s: string): string =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const norm = normalizeLabel;

export function pickRow(labels: string[], wanted: string, options: { exactOnly?: boolean } = {}): RowPick {
  const target = norm(wanted);
  if (!target) return { kind: 'none' };

  const exact = labels.map((l, i) => [norm(l), i] as const).filter(([l]) => l === target);
  if (exact.length === 1) return { kind: 'one', index: exact[0][1] };
  if (exact.length > 1) return { kind: 'many', labels: exact.map(([, i]) => labels[i]) };
  if (options.exactOnly) return { kind: 'none' };

  const partial = labels
    .map((l, i) => [norm(l), i] as const)
    // Only the requested label may be a shorter form of the row. The reverse
    // direction lets a tiny query such as "IA" select a long unrelated title.
    .filter(([l]) => l && l.includes(target));
  if (partial.length === 1) return { kind: 'one', index: partial[0][1] };
  if (partial.length > 1) return { kind: 'many', labels: partial.map(([, i]) => labels[i]) };
  return { kind: 'none' };
}

/**
 * How many rows have exactly `label`, normalized — never a partial match.
 *
 * Used to tell "this exact record was created/is gone" apart from "a
 * differently-worded neighbour happens to exist": a partial match (the same
 * one `pickRow` uses to resolve an unambiguous search) is the wrong tool here,
 * because a near-namesake ("Deep learning for crop yield in Colombia") must
 * not count as the record ("Deep learning for crop yield") whose presence is
 * actually being decided.
 */
export function exactLabelCount(labels: string[], label: string): number {
  const target = normalizeLabel(label);
  return labels.filter((l) => normalizeLabel(l) === target).length;
}
