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

/** Timeline bucket pacing consistency (preferred over utterance-based variance). */
export type DeepgramConsistency = {
  bucketWindowSeconds: number;
  bucketCount: number;
  bucketWpmMean: number | null;
  bucketWpmStdDev: number | null;
  bucketWpmCv: number | null;
  pacingTrendSlope: number | null;
  /** WPM samples at bucket start times (seconds from speech onset), for pacing charts. */
  bucketChartPoints: { timeSeconds: number; wpm: number }[];
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
  /** @deprecated Legacy: population variance of per-utterance WPM — driven by segmentation, not rhythm. Prefer `consistency`. */
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
    bucketWindowSeconds: 0,
    bucketCount: 0,
    bucketWpmMean: null,
    bucketWpmStdDev: null,
    bucketWpmCv: null,
    pacingTrendSlope: null,
    bucketChartPoints: [],
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

/** Midpoint-assignment buckets over [speechStart, speechEnd]. Only non-empty (≥1 word) buckets produce WPM values. */
function computeBucketConsistency(params: {
  speechStart: number;
  speechEnd: number;
  validWords: DeepgramWord[];
  totalSpeechSeconds: number;
  wordCount: number;
}): DeepgramConsistency {
  const { speechStart, speechEnd, validWords, totalSpeechSeconds, wordCount } =
    params;

  if (
    totalSpeechSeconds < 8 ||
    wordCount < 10 ||
    !Number.isFinite(speechStart) ||
    !Number.isFinite(speechEnd) ||
    speechEnd <= speechStart
  ) {
    return emptyConsistency();
  }

  const timelineSeconds = speechEnd - speechStart;
  const bucketWindowSeconds = timelineSeconds < 20 ? 3 : 5;

  const bucketWpmValues: number[] = [];
  const bucketChartPoints: { timeSeconds: number; wpm: number }[] = [];

  for (let i = 0; ; i++) {
    const bStart = speechStart + i * bucketWindowSeconds;
    if (bStart >= speechEnd) break;
    const bEnd = Math.min(bStart + bucketWindowSeconds, speechEnd);
    const bucketDurationSeconds = bEnd - bStart;
    if (bucketDurationSeconds <= 0 || !Number.isFinite(bucketDurationSeconds)) {
      continue;
    }

    let wordsInBucket = 0;
    for (const w of validWords) {
      const mid = (w.start + w.end) / 2;
      if (mid >= bStart && mid < bEnd) {
        wordsInBucket += 1;
      }
    }

    if (wordsInBucket === 0) continue;

    const bucketWpm = (wordsInBucket / bucketDurationSeconds) * 60;
    const wpmRounded = round2(bucketWpm);
    bucketWpmValues.push(wpmRounded);
    bucketChartPoints.push({
      timeSeconds: round2(i * bucketWindowSeconds),
      wpm: wpmRounded,
    });
  }

  const bucketCount = bucketWpmValues.length;

  let bucketWpmMean: number | null = null;
  let bucketWpmStdDev: number | null = null;
  let bucketWpmCv: number | null = null;
  let pacingTrendSlope: number | null = null;

  if (bucketCount === 0) {
    return {
      bucketWindowSeconds,
      bucketCount: 0,
      bucketWpmMean: null,
      bucketWpmStdDev: null,
      bucketWpmCv: null,
      pacingTrendSlope: null,
      bucketChartPoints: [],
    };
  }

  let sumBucket = 0;
  for (let j = 0; j < bucketCount; j++) {
    sumBucket += bucketWpmValues[j]!;
  }
  const meanBucket = sumBucket / bucketCount;
  bucketWpmMean = round2(meanBucket);

  let sumSqDev = 0;
  for (let j = 0; j < bucketCount; j++) {
    const d = bucketWpmValues[j]! - meanBucket;
    sumSqDev += d * d;
  }
  const variancePop = sumSqDev / bucketCount;
  const stdBucket = Math.sqrt(variancePop);
  bucketWpmStdDev = round2(stdBucket);

  if (meanBucket <= 0) {
    bucketWpmCv = null;
  } else {
    bucketWpmCv = round2(stdBucket / meanBucket);
  }

  if (bucketCount >= 3) {
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    const nSlope = bucketCount;
    for (let x = 0; x < nSlope; x++) {
      const y = bucketWpmValues[x]!;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }
    const denom = nSlope * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-12) {
      pacingTrendSlope = round2(0);
    } else {
      pacingTrendSlope = round2((nSlope * sumXY - sumX * sumY) / denom);
    }
  }

  return {
    bucketWindowSeconds,
    bucketCount,
    bucketWpmMean,
    bucketWpmStdDev,
    bucketWpmCv,
    pacingTrendSlope,
    bucketChartPoints,
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

  const consistency = computeBucketConsistency({
    speechStart: first.start,
    speechEnd: last.end,
    validWords,
    totalSpeechSeconds,
    wordCount,
  });

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
