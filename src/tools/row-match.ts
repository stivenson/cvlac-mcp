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

const norm = (s: string): string =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function pickRow(labels: string[], wanted: string): RowPick {
  const target = norm(wanted);
  if (!target) return { kind: 'none' };

  const exact = labels.map((l, i) => [norm(l), i] as const).filter(([l]) => l === target);
  if (exact.length === 1) return { kind: 'one', index: exact[0][1] };
  if (exact.length > 1) return { kind: 'many', labels: exact.map(([, i]) => labels[i]) };

  const partial = labels
    .map((l, i) => [norm(l), i] as const)
    .filter(([l]) => l && (l.includes(target) || target.includes(l)));
  if (partial.length === 1) return { kind: 'one', index: partial[0][1] };
  if (partial.length > 1) return { kind: 'many', labels: partial.map(([, i]) => labels[i]) };
  return { kind: 'none' };
}
