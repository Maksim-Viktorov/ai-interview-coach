import type { DeepgramAnalytics } from './deepgram-analytics';

export type DimensionScore = {
  score: number | null;
  label: string;
  comment: string;
};

export type DimensionScorecard = {
  pace: DimensionScore;
  fluency: DimensionScore;
  cleanliness: DimensionScore;
  dynamism: DimensionScore;
};

function clampInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function linearMap(
  x: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): number {
  if (x0 === x1) return y0;
  const t = (x - x0) / (x1 - x0);
  return y0 + t * (y1 - y0);
}

function paceScoreFromWpm(wpm: number): number {
  if (!Number.isFinite(wpm)) return 0;
  if (wpm >= 180 && wpm <= 230) return 100;
  if (wpm >= 150 && wpm < 180) {
    return linearMap(wpm, 180, 150, 100, 60);
  }
  if (wpm > 230 && wpm <= 260) {
    return linearMap(wpm, 230, 260, 100, 60);
  }
  if (wpm < 150) {
    if (wpm <= 0) return 0;
    return linearMap(wpm, 0, 150, 0, 60);
  }
  if (wpm > 260) {
    const y = linearMap(wpm, 260, 410, 60, 0);
    return Math.max(0, y);
  }
  return 0;
}

function paceLabelComment(score: number): Pick<DimensionScore, 'label' | 'comment'> {
  if (score >= 85) {
    return {
      label: 'Ideal pace',
      comment: 'Clear, confident, easy to follow',
    };
  }
  if (score >= 60) {
    return {
      label: 'Acceptable pace',
      comment: 'Slightly outside the ideal band but still understandable',
    };
  }
  return {
    label: 'Pace concern',
    comment: 'Pace is significantly outside the ideal range',
  };
}

function longPausesSubScore(longPausesPerMinute: number): number {
  const x = longPausesPerMinute;
  if (!Number.isFinite(x) || x < 0) return 0;
  if (x < 1) return 100;
  if (x <= 2) {
    return linearMap(x, 1, 2, 100, 60);
  }
  const y = linearMap(x, 2, 8, 60, 0);
  return Math.max(0, y);
}

function meanRunLengthSubScore(meanRunLength: number): number {
  const m = meanRunLength;
  if (!Number.isFinite(m) || m < 0) return 0;
  if (m >= 12) return 100;
  if (m >= 6) {
    return linearMap(m, 12, 6, 100, 60);
  }
  if (m <= 0) return 0;
  return linearMap(m, 0, 6, 0, 60);
}

function fluencyLabelComment(score: number): Pick<DimensionScore, 'label' | 'comment'> {
  if (score >= 85) {
    return {
      label: 'Fluid delivery',
      comment: 'Strong flow with minimal hesitation',
    };
  }
  if (score >= 60) {
    return {
      label: 'Moderately fluid',
      comment: 'Some pauses or short bursts disrupted flow',
    };
  }
  return {
    label: 'Disrupted flow',
    comment: 'Long pauses or short bursts significantly broke up your delivery',
  };
}

function cleanlinessScore(density: number): number {
  const d = density;
  if (!Number.isFinite(d) || d < 0) return 0;
  if (d <= 2) return 100;
  if (d <= 5) {
    return linearMap(d, 2, 5, 100, 60);
  }
  if (d <= 10) {
    return linearMap(d, 5, 10, 60, 0);
  }
  return 0;
}

function cleanlinessLabelComment(score: number): Pick<DimensionScore, 'label' | 'comment'> {
  if (score >= 85) {
    return {
      label: 'Clean delivery',
      comment: 'Very few filler words',
    };
  }
  if (score >= 60) {
    return {
      label: 'Mostly clean',
      comment: 'A few filler words but not distracting',
    };
  }
  return {
    label: 'Frequent fillers',
    comment: 'Filler words noticeably affected your delivery',
  };
}

function peaksSubScore(peaksPerMinute: number): number {
  const p = peaksPerMinute;
  if (!Number.isFinite(p) || p < 0) return 0;
  if (p >= 2 && p <= 6) return 100;
  if (p >= 1 && p <= 2) {
    return linearMap(p, 1, 2, 100, 60);
  }
  if (p > 6 && p <= 8) {
    return linearMap(p, 6, 8, 100, 60);
  }
  if (p < 1) {
    return linearMap(p, 0, 1, 0, 60);
  }
  if (p > 8) {
    return Math.max(0, linearMap(p, 8, 18, 60, 0));
  }
  return 0;
}

function driftSubScore(absDrift: number): number {
  const d = absDrift;
  if (!Number.isFinite(d) || d < 0) return 0;
  if (d <= 15) return 100;
  if (d <= 30) {
    return linearMap(d, 15, 30, 100, 60);
  }
  if (d <= 50) {
    return linearMap(d, 30, 50, 60, 0);
  }
  return 0;
}

function dynamismLabelComment(score: number): Pick<DimensionScore, 'label' | 'comment'> {
  if (score >= 85) {
    return {
      label: 'Dynamic delivery',
      comment: 'Expressive pace with natural emphasis',
    };
  }
  if (score >= 60) {
    return {
      label: 'Moderate dynamism',
      comment: 'Some expressive variation',
    };
  }
  return {
    label: 'Limited dynamism',
    comment: 'Delivery was either monotone or unevenly paced',
  };
}

export function computeDimensionScorecard(
  analytics: DeepgramAnalytics,
): DimensionScorecard {
  const wpm = analytics.speakingRateWpm;
  const paceRaw = paceScoreFromWpm(wpm);
  const paceScore = clampInt(paceRaw);
  const paceMeta = paceLabelComment(paceScore);

  const lpScore = longPausesSubScore(analytics.longPausesPerMinute);
  const mrlScore = meanRunLengthSubScore(analytics.meanRunLength);
  const fluencyRaw = 0.6 * lpScore + 0.4 * mrlScore;
  const fluencyScore = clampInt(fluencyRaw);
  const fluencyMeta = fluencyLabelComment(fluencyScore);

  const cleanRaw = cleanlinessScore(analytics.fillerDensityPer100Words);
  const cleanScore = clampInt(cleanRaw);
  const cleanMeta = cleanlinessLabelComment(cleanScore);

  const duration = analytics.activeAnswerDurationSeconds;
  let dynamism: DimensionScore;
  if (!Number.isFinite(duration) || duration < 15) {
    dynamism = {
      score: null,
      label: 'Not enough data',
      comment: 'Answer was too short to assess dynamism',
    };
  } else {
    const peaks = peaksSubScore(analytics.peaksPerMinute);
    const drift = driftSubScore(
      Math.abs(analytics.consistency.pacingAnalysis.openingToClosingDrift),
    );
    const dynRaw = 0.6 * peaks + 0.4 * drift;
    const dynScore = clampInt(dynRaw);
    const dynMeta = dynamismLabelComment(dynScore);
    dynamism = {
      score: dynScore,
      label: dynMeta.label,
      comment: dynMeta.comment,
    };
  }

  return {
    pace: {
      score: paceScore,
      label: paceMeta.label,
      comment: paceMeta.comment,
    },
    fluency: {
      score: fluencyScore,
      label: fluencyMeta.label,
      comment: fluencyMeta.comment,
    },
    cleanliness: {
      score: cleanScore,
      label: cleanMeta.label,
      comment: cleanMeta.comment,
    },
    dynamism,
  };
}
