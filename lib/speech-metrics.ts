export type SpeechMetrics = {
  wordCount: number;
  durationSeconds: number;
  wordsPerMinute: number;
  paceFeedback: string;
  fillerCount: number;
  fillerFeedback: string;
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Normalizes jsonb / API-shaped metrics; returns null if invalid. */
export function parseSpeechMetrics(raw: unknown): SpeechMetrics | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (
    !isFiniteNumber(o.wordCount) ||
    !isFiniteNumber(o.durationSeconds) ||
    !isFiniteNumber(o.wordsPerMinute) ||
    typeof o.paceFeedback !== 'string' ||
    !isFiniteNumber(o.fillerCount) ||
    typeof o.fillerFeedback !== 'string'
  ) {
    return null;
  }
  return {
    wordCount: o.wordCount,
    durationSeconds: o.durationSeconds,
    wordsPerMinute: o.wordsPerMinute,
    paceFeedback: o.paceFeedback,
    fillerCount: o.fillerCount,
    fillerFeedback: o.fillerFeedback,
  };
}
