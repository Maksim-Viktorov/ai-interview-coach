const MIN_PAUSE_SECONDS = 0.8;
const LONG_PAUSE_SECONDS = 1.5;

export type DeepgramUtterance = {
  start: number;
  end: number;
  transcript?: string;
};

export type DeepgramWord = {
  word: string;
  start: number;
  end: number;
};

export type UtteranceAnalytics = {
  index: number;
  start: number;
  end: number;
  durationSeconds: number;
  wordCount: number;
  speakingRateWpm: number;
};

export type DeepgramAnalytics = {
  pauseCount: number;
  longPauseCount: number;
  totalPauseSeconds: number;
  longestPauseSeconds: number;
  averagePauseSeconds: number;
  activeAnswerDurationSeconds: number;
  totalSpeechSeconds: number;
  speechRatio: number;
  speakingRateWpm: number;
  utterances: UtteranceAnalytics[];
  averageUtteranceWpm: number;
  wpmVariance: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isValidUtterance(u: unknown): u is DeepgramUtterance {
  if (u == null || typeof u !== 'object') return false;
  const o = u as Record<string, unknown>;
  const start = o.start;
  const end = o.end;
  if (typeof start !== 'number' || !Number.isFinite(start)) return false;
  if (typeof end !== 'number' || !Number.isFinite(end)) return false;
  return start <= end;
}

function isValidWord(w: unknown): w is DeepgramWord {
  if (w == null || typeof w !== 'object') return false;
  const o = w as Record<string, unknown>;
  if (typeof o.word !== 'string') return false;
  const start = o.start;
  const end = o.end;
  if (typeof start !== 'number' || !Number.isFinite(start)) return false;
  if (typeof end !== 'number' || !Number.isFinite(end)) return false;
  return start <= end;
}

function emptyAnalytics(): DeepgramAnalytics {
  return {
    pauseCount: 0,
    longPauseCount: 0,
    totalPauseSeconds: 0,
    longestPauseSeconds: 0,
    averagePauseSeconds: 0,
    activeAnswerDurationSeconds: 0,
    totalSpeechSeconds: 0,
    speechRatio: 0,
    speakingRateWpm: 0,
    utterances: [],
    averageUtteranceWpm: 0,
    wpmVariance: 0,
  };
}

export function analyzeDeepgramSpeech(options: {
  utterances: DeepgramUtterance[];
  words: DeepgramWord[];
}): DeepgramAnalytics {
  const { utterances, words } = options;

  if (!Array.isArray(utterances) || utterances.length === 0) {
    return emptyAnalytics();
  }

  const wordList = Array.isArray(words) ? words : [];
  const validWords = wordList.filter(isValidWord);
  const wordCount = validWords.length;

  const valid = utterances.filter(isValidUtterance);
  if (valid.length === 0) {
    return emptyAnalytics();
  }

  const sorted = [...valid].sort((a, b) => a.start - b.start);

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  const activeAnswerDurationSeconds = last.end - first.start;
  if (!Number.isFinite(activeAnswerDurationSeconds) || activeAnswerDurationSeconds <= 0) {
    return emptyAnalytics();
  }

  let totalSpeechSeconds = 0;
  for (const u of sorted) {
    totalSpeechSeconds += u.end - u.start;
  }

  let pauseCount = 0;
  let longPauseCount = 0;
  let totalPauseSecondsRaw = 0;
  let longestPauseSeconds = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]!;
    const next = sorted[i + 1]!;
    const gap = next.start - current.end;
    if (!Number.isFinite(gap) || gap < MIN_PAUSE_SECONDS) continue;
    pauseCount += 1;
    totalPauseSecondsRaw += gap;
    if (gap > longestPauseSeconds) longestPauseSeconds = gap;
    if (gap >= LONG_PAUSE_SECONDS) longPauseCount += 1;
  }

  const speechRatio =
    activeAnswerDurationSeconds > 0
      ? round2(totalSpeechSeconds / activeAnswerDurationSeconds)
      : 0;

  const speakingRateWpm =
    totalSpeechSeconds > 0 ? round2((wordCount / totalSpeechSeconds) * 60) : 0;

  const averagePauseSeconds =
    pauseCount > 0 ? round2(totalPauseSecondsRaw / pauseCount) : 0;

  const utteranceAnalyticsList: UtteranceAnalytics[] = [];
  const utteranceWpmValues: number[] = [];

  for (let index = 0; index < sorted.length; index++) {
    const utterance = sorted[index]!;
    const utteranceStart = utterance.start;
    const utteranceEnd = utterance.end;
    const durationRaw = utteranceEnd - utteranceStart;

    const wordsInUtterance = validWords.filter((w) => {
      return w.end > utteranceStart && w.start < utteranceEnd;
    });
    const utteranceWordCount = wordsInUtterance.length;

    const durationSeconds = round2(durationRaw);

    let utteranceSpeakingRateWpm = 0;
    if (durationRaw > 0 && Number.isFinite(durationRaw)) {
      utteranceSpeakingRateWpm = round2(
        (utteranceWordCount / durationRaw) * 60,
      );
    }

    utteranceWpmValues.push(utteranceSpeakingRateWpm);

    utteranceAnalyticsList.push({
      index,
      start: utteranceStart,
      end: utteranceEnd,
      durationSeconds,
      wordCount: utteranceWordCount,
      speakingRateWpm: utteranceSpeakingRateWpm,
    });
  }

  let averageUtteranceWpm = 0;
  let wpmVariance = 0;

  const nUtterances = utteranceWpmValues.length;
  if (nUtterances > 0) {
    let sumWpm = 0;
    for (let i = 0; i < nUtterances; i++) {
      sumWpm += utteranceWpmValues[i]!;
    }
    const meanWpm = sumWpm / nUtterances;
    averageUtteranceWpm = round2(meanWpm);

    let sumSquaredDeviation = 0;
    for (let i = 0; i < nUtterances; i++) {
      const wpm = utteranceWpmValues[i]!;
      const deviation = wpm - meanWpm;
      sumSquaredDeviation += deviation * deviation;
    }
    wpmVariance = round2(sumSquaredDeviation / nUtterances);
  }

  return {
    pauseCount,
    longPauseCount,
    totalPauseSeconds: round2(totalPauseSecondsRaw),
    longestPauseSeconds: round2(longestPauseSeconds),
    averagePauseSeconds,
    activeAnswerDurationSeconds: round2(activeAnswerDurationSeconds),
    totalSpeechSeconds: round2(totalSpeechSeconds),
    speechRatio,
    speakingRateWpm,
    utterances: utteranceAnalyticsList,
    averageUtteranceWpm,
    wpmVariance,
  };
}
