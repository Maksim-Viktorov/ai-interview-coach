export const FILLER_PHRASES = [
  'um',
  'uh',
  'like',
  'you know',
  'actually',
  'basically',
  'so',
  'right',
] as const;

/** Counts filler occurrences in text using word-boundary regex (case-insensitive). */
export function countFillersInText(text: string): number {
  if (!text) return 0;
  let total = 0;
  for (const phrase of FILLER_PHRASES) {
    const escaped = phrase
      .split(/\s+/)
      .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'gi');
    const matches = text.match(pattern);
    total += matches ? matches.length : 0;
  }
  return total;
}

export type FillerRange = { start: number; end: number; text: string };

/** Ranges to highlight; longest phrases first in the combined pattern. */
export function findFillerRanges(text: string): FillerRange[] {
  if (!text) return [];
  const sorted = [...FILLER_PHRASES].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((phrase) =>
    phrase
      .split(/\s+/)
      .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+'),
  );
  const combined = new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'gi');

  const ranges: FillerRange[] = [];
  let match: RegExpExecArray | null;
  while ((match = combined.exec(text)) !== null) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
  }
  return ranges;
}
