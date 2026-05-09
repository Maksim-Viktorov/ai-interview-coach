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

/** Sliding word-window pacing sample (flat words channel, sorted by start). */
export type PacingWindowPoint = {
  midTime: number;
  wpm: number;
};

export type PacingShape =
  | 'steady'
  | 'accelerating'
  | 'decelerating'
  | 'strong-start'
  | 'strong-finish'
  | 'wave';

export type DeepgramConsistency = {
  pacingWindows: PacingWindowPoint[];
  pacingShape: PacingShape | null;
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
  /** @deprecated Legacy: population variance of per-utterance WPM — driven by segmentation, not rhythm. Prefer `consistency.pacingWindows`. */
  wpmVariance: number;
  consistency: DeepgramConsistency;
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

function emptyConsistency(): DeepgramConsistency {
  return {
    pacingWindows: [],
    pacingShape: null,
  };
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
    consistency: emptyConsistency(),
  };
}

function slidingWindowParams(totalWords: number): {
  windowSize: number;
  step: number;
} {
  if (totalWords < 50) {
    return { windowSize: 8, step: 3 };
  }
  if (totalWords <= 150) {
    return { windowSize: 15, step: 5 };
  }
  return { windowSize: 20, step: 7 };
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  let s = 0;
  for (const n of nums) {
    s += n;
  }
  return s / nums.length;
}

/**
 * Thirds-based pacing shape from overlapping window WPM series (chronological).
 */
export function classifyPacingShape(wpms: number[]): PacingShape | null {
  const n = wpms.length;
  if (n < 3) {
    return null;
  }

  const t = Math.floor(n / 3);
  const i1 = Math.max(1, t);
  const i2 = Math.max(i1 + 1, t * 2);
  const segStart = wpms.slice(0, i1);
  const segMid = wpms.slice(i1, i2);
  const segEnd = wpms.slice(i2);

  const S = avg(segStart);
  const M = avg(segMid.length > 0 ? segMid : wpms.slice(i1, i1 + 1));
  const E = avg(segEnd.length > 0 ? segEnd : wpms.slice(n - 1));

  const meanAll = (S + M + E) / 3;
  const tol = Math.max(12, meanAll * 0.07);

  const hi = Math.max(S, M, E);
  const lo = Math.min(S, M, E);
  if (hi - lo < tol) {
    return 'steady';
  }

  if (M >= S + tol && M >= E + tol) {
    return 'wave';
  }
  if (M <= S - tol && M <= E - tol) {
    return 'wave';
  }

  if (S >= E + tol && S >= M - tol * 0.5) {
    return 'strong-start';
  }
  if (E >= S + tol && E >= M - tol * 0.5) {
    return 'strong-finish';
  }

  if (S + tol < M && M + tol < E) {
    return 'accelerating';
  }
  if (S > M + tol && M > E + tol) {
    return 'decelerating';
  }

  return 'steady';
}

function computePacingWindows(validWords: DeepgramWord[]): PacingWindowPoint[] {
  const sortedWords = [...validWords].sort((a, b) => a.start - b.start);
  const totalWords = sortedWords.length;
  const { windowSize, step } = slidingWindowParams(totalWords);

  if (totalWords < windowSize) {
    return [];
  }

  const out: PacingWindowPoint[] = [];

  for (let start = 0; start + windowSize <= totalWords; start += step) {
    const windowSlice = sortedWords.slice(start, start + windowSize);
    const firstWord = windowSlice[0]!;
    const lastWord = windowSlice[windowSlice.length - 1]!;
    const durationSeconds = lastWord.end - firstWord.start;

    if (
      durationSeconds <= 0 ||
      !Number.isFinite(durationSeconds) ||
      !Number.isFinite(firstWord.start) ||
      !Number.isFinite(lastWord.end)
    ) {
      continue;
    }

    const wpm = (windowSlice.length / durationSeconds) * 60;
    const midTime = (firstWord.start + lastWord.end) / 2;

    out.push({
      midTime: round2(midTime),
      wpm: round2(wpm),
    });
  }

  out.sort((a, b) => a.midTime - b.midTime);
  return out;
}

function computePacingConsistency(validWords: DeepgramWord[]): DeepgramConsistency {
  const pacingWindows = computePacingWindows(validWords);
  if (pacingWindows.length === 0) {
    return emptyConsistency();
  }

  const wpms = pacingWindows.map((p) => p.wpm);
  const pacingShape = classifyPacingShape(wpms);

  return {
    pacingWindows,
    pacingShape,
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
  /** Legacy utterance-WPM variance (coach still consumes until updated). */
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

  const consistency = computePacingConsistency(validWords);

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
    consistency,
  };
}

/** Population CV of window WPMs — used by coach for variance scoring. */
export function pacingWindowsCv(windows: PacingWindowPoint[]): number | null {
  const values = windows.map((w) => w.wpm);
  if (values.length < 3) {
    return null;
  }
  let sum = 0;
  for (const v of values) {
    sum += v;
  }
  const mean = sum / values.length;
  if (mean <= 0 || !Number.isFinite(mean)) {
    return null;
  }
  let sumSq = 0;
  for (const v of values) {
    const d = v - mean;
    sumSq += d * d;
  }
  const std = Math.sqrt(sumSq / values.length);
  return round2(std / mean);
}

/** Linear slope of WPM vs. window index (for tempo-change penalty in coach). */
export function pacingWindowsTrendSlope(windows: PacingWindowPoint[]): number | null {
  const yValues = windows.map((w) => w.wpm);
  const n = yValues.length;
  if (n < 3) {
    return null;
  }
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let x = 0; x < n; x++) {
    const y = yValues[x]!;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-12) {
    return round2(0);
  }
  return round2((n * sumXY - sumX * sumY) / denom);
}

