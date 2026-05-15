import { countFillersInText } from '@/lib/filler-detection';

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

export type PacingAnalysis = {
  shape:
    | 'steady'
    | 'accelerating'
    | 'decelerating'
    | 'strong-start'
    | 'strong-finish'
    | 'wave'
    | 'erratic'
    | 'insufficient';
  trendSlope: number;
  lrv: number;
  fluencyScore: number;
  peakCount: number;
  valleyCount: number;
  peakLocations: number[];
  valleyLocations: number[];
  openingWpm: number;
  closingWpm: number;
  openingToClosingDrift: number;
};

export type DeepgramConsistency = {
  pacingWindows: PacingWindowPoint[];
  pacingAnalysis: PacingAnalysis;
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
  totalWords: number;
  /** Average words between pauses: totalWords / (pauseCount + 1). */
  meanRunLength: number;
  fillerDensityPer100Words: number;
  peaksPerMinute: number;
  valleysPerMinute: number;
  longPausesPerMinute: number;
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

function insufficientPacingAnalysis(): PacingAnalysis {
  return {
    shape: 'insufficient',
    trendSlope: 0,
    lrv: 0,
    fluencyScore: 0,
    peakCount: 0,
    valleyCount: 0,
    peakLocations: [],
    valleyLocations: [],
    openingWpm: 0,
    closingWpm: 0,
    openingToClosingDrift: 0,
  };
}

function emptyConsistency(): DeepgramConsistency {
  return {
    pacingWindows: [],
    pacingAnalysis: insufficientPacingAnalysis(),
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
    totalWords: 0,
    meanRunLength: 0,
    fillerDensityPer100Words: 0,
    peaksPerMinute: 0,
    valleysPerMinute: 0,
    longPausesPerMinute: 0,
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

/** Bell-curve fluency score from raw LRV (local rate of variation). */
function computeFluencyScore(lrv: number): number {
  if (!Number.isFinite(lrv) || lrv < 0) {
    return 0;
  }
  if (lrv >= 20 && lrv <= 30) {
    return 100;
  }
  if (lrv >= 15 && lrv < 20) {
    return Math.round(60 + ((lrv - 15) / 5) * 40);
  }
  if (lrv > 30 && lrv <= 35) {
    return Math.round(100 - ((lrv - 30) / 5) * 40);
  }
  if (lrv >= 10 && lrv < 15) {
    return Math.round(((lrv - 10) / 5) * 60);
  }
  if (lrv > 35 && lrv <= 45) {
    return Math.round(60 - ((lrv - 35) / 10) * 60);
  }
  return 0;
}

function regressionSlopeWpmPerIndex(wpms: number[]): number {
  const n = wpms.length;
  if (n < 2) {
    return 0;
  }
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let x = 0; x < n; x++) {
    const y = wpms[x]!;
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

/**
 * Full pacing curve analysis from chronological sliding-window samples.
 */
export function analyzePacingCurve(
  dataPoints: PacingWindowPoint[],
): PacingAnalysis {
  if (dataPoints.length < 5) {
    return insufficientPacingAnalysis();
  }

  const wpms = dataPoints.map((p) => p.wpm);
  const n = wpms.length;

  const trendSlope = regressionSlopeWpmPerIndex(wpms);

  let sumAdjDiff = 0;
  let adjCount = 0;
  for (let i = 0; i < n - 1; i++) {
    sumAdjDiff += Math.abs(wpms[i + 1]! - wpms[i]!);
    adjCount += 1;
  }
  const lrvRaw = adjCount > 0 ? sumAdjDiff / adjCount : 0;
  const lrv = round2(lrvRaw);

  const fluencyScore = computeFluencyScore(lrvRaw);

  const peakLocations: number[] = [];
  const valleyLocations: number[] = [];
  for (let i = 1; i <= n - 2; i++) {
    const w = wpms[i]!;
    const prev = wpms[i - 1]!;
    const next = wpms[i + 1]!;
    if (
      w > prev &&
      w > next &&
      Math.abs(w - prev) > 15 &&
      Math.abs(w - next) > 15
    ) {
      peakLocations.push(round2(dataPoints[i]!.midTime));
    }
    if (
      w < prev &&
      w < next &&
      Math.abs(w - prev) > 15 &&
      Math.abs(w - next) > 15
    ) {
      valleyLocations.push(round2(dataPoints[i]!.midTime));
    }
  }
  const peakCount = peakLocations.length;
  const valleyCount = valleyLocations.length;

  const headLen = Math.max(1, Math.round(n * 0.2));
  const tailLen = Math.max(1, Math.round(n * 0.2));
  const openingWpm = round2(avg(wpms.slice(0, headLen)));
  const closingWpm = round2(avg(wpms.slice(-tailLen)));
  const openingToClosingDrift = round2(closingWpm - openingWpm);

  let shape: PacingAnalysis['shape'];
  if (peakCount >= 2 && valleyCount >= 2) {
    shape = 'wave';
  } else if (lrv > 40) {
    shape = 'erratic';
  } else if (
    Math.abs(openingToClosingDrift) < 10 &&
    lrv < 15
  ) {
    shape = 'steady';
  } else if (openingToClosingDrift > 15 && trendSlope > 0) {
    shape = 'accelerating';
  } else if (openingToClosingDrift < -15 && trendSlope < 0) {
    shape = 'decelerating';
  } else if (openingWpm > closingWpm + 20) {
    shape = 'strong-start';
  } else if (closingWpm > openingWpm + 20) {
    shape = 'strong-finish';
  } else {
    shape = 'steady';
  }

  return {
    shape,
    trendSlope,
    lrv,
    fluencyScore,
    peakCount,
    valleyCount,
    peakLocations,
    valleyLocations,
    openingWpm,
    closingWpm,
    openingToClosingDrift,
  };
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

  const pacingAnalysis = analyzePacingCurve(pacingWindows);

  return {
    pacingWindows,
    pacingAnalysis,
  };
}

export function analyzeDeepgramSpeech(options: {
  utterances: DeepgramUtterance[];
  words: DeepgramWord[];
  transcript: string;
}): DeepgramAnalytics {
  const { utterances, words, transcript } = options;

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
  /** Legacy utterance-WPM variance (segmentation-driven). */
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
  const pacingAnalysis = consistency.pacingAnalysis;

  const durationForRates =
    Number.isFinite(activeAnswerDurationSeconds) && activeAnswerDurationSeconds > 0
      ? activeAnswerDurationSeconds
      : 0;

  const totalWords = wordCount;
  const meanRunLength =
    totalWords > 0 ? round2(totalWords / (pauseCount + 1)) : 0;

  const fillerCount = countFillersInText(transcript);
  const fillerDensityPer100Words =
    totalWords > 0 ? round2((fillerCount / totalWords) * 100) : 0;

  const peaksPerMinute =
    durationForRates > 0
      ? round2((pacingAnalysis.peakCount / durationForRates) * 60)
      : 0;
  const valleysPerMinute =
    durationForRates > 0
      ? round2((pacingAnalysis.valleyCount / durationForRates) * 60)
      : 0;
  const longPausesPerMinute =
    durationForRates > 0
      ? round2((longPauseCount / durationForRates) * 60)
      : 0;

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
    totalWords,
    meanRunLength,
    fillerDensityPer100Words,
    peaksPerMinute,
    valleysPerMinute,
    longPausesPerMinute,
    utterances: utteranceAnalyticsList,
    averageUtteranceWpm,
    wpmVariance,
    consistency,
  };
}

/** Population CV of window WPMs — optional diagnostics. */
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
