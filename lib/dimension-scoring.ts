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
  if (wpm < 140 || wpm > 280) return 0;
  if (wpm >= 140 && wpm < 165) {
    return linearMap(wpm, 140, 165, 0, 60);
  }
  if (wpm >= 165 && wpm < 180) {
    return linearMap(wpm, 165, 180, 60, 100);
  }
  if (wpm >= 180 && wpm <= 230) {
    return 100;
  }
  if (wpm > 230 && wpm <= 250) {
    return linearMap(wpm, 230, 250, 100, 60);
  }
  if (wpm > 250 && wpm <= 280) {
    return linearMap(wpm, 250, 280, 60, 0);
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
      comment: 'Slightly outside ideal but understandable',
    };
  }
  return {
    label: 'Pace concern',
    comment: 'Pace is significantly outside ideal range',
  };
}

function computeFluencyDimension(analytics: DeepgramAnalytics): DimensionScore {
  const pa = analytics.consistency.pacingAnalysis;
  if (pa.shape === 'insufficient') {
    return {
      score: null,
      label: 'Not enough data',
      comment: 'Answer was too short to assess rhythm',
    };
  }

  const score = clampInt(pa.fluencyScore);

  let label: string;
  let comment: string;
  if (score >= 85) {
    label = 'Natural rhythm';
    comment = 'Your pace varied naturally with good rhythmic flow';
  } else if (score >= 60) {
    label = 'Moderate rhythm';
    comment = 'Some rhythmic variation but room for more natural flow';
  } else if (score >= 30) {
    label = 'Limited rhythm';
    comment = 'Delivery was either too uniform or unevenly varied';
  } else {
    label = 'Flat or erratic';
    comment = 'Delivery lacked natural rhythmic variation';
  }

  return { score, label, comment };
}

function cleanlinessScore(density: number): number {
  const d = density;
  if (!Number.isFinite(d) || d < 0) return 0;
  if (d <= 3) return 100;
  if (d <= 7) {
    return linearMap(d, 3, 7, 100, 60);
  }
  if (d <= 12) {
    return linearMap(d, 7, 12, 60, 0);
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
      comment: 'Some filler words but not distracting',
    };
  }
  return {
    label: 'Frequent fillers',
    comment: 'Filler words noticeably affected your delivery',
  };
}

function computeDynamismDimension(analytics: DeepgramAnalytics): DimensionScore {
  const duration = analytics.activeAnswerDurationSeconds;
  if (!Number.isFinite(duration) || duration < 15) {
    return {
      score: null,
      label: 'Not enough data',
      comment: 'Answer was too short to assess dynamism',
    };
  }

  const peaks = analytics.peaksPerMinute;
  let score: number;

  if (peaks >= 2 && peaks <= 6) {
    score = 100;
  } else if (peaks >= 1 && peaks < 2) {
    score = Math.round(60 + (peaks - 1) * 40);
  } else if (peaks > 6 && peaks <= 8) {
    score = Math.round(100 - ((peaks - 6) / 2) * 40);
  } else if (peaks < 1) {
    score = Math.round(peaks * 60);
  } else {
    score = Math.max(0, Math.round(60 - ((peaks - 8) / 4) * 60));
  }

  score = Math.max(0, Math.min(100, score));

  let label: string;
  let comment: string;
  if (score >= 85) {
    label = 'Dynamic delivery';
    comment = 'Expressive pace with natural emphasis';
  } else if (score >= 60) {
    label = 'Moderate dynamism';
    comment = 'Some expressive variation';
  } else {
    label = 'Limited dynamism';
    comment = 'Delivery was either monotone or too uniform';
  }

  return { score, label, comment };
}

export function computeDimensionScorecard(
  analytics: DeepgramAnalytics,
): DimensionScorecard {
  const wpm = analytics.speakingRateWpm;
  const paceRaw = paceScoreFromWpm(wpm);
  const paceScore = clampInt(paceRaw);
  const paceMeta = paceLabelComment(paceScore);

  const fluency = computeFluencyDimension(analytics);

  const cleanRaw = cleanlinessScore(analytics.fillerDensityPer100Words);
  const cleanScore = clampInt(cleanRaw);
  const cleanMeta = cleanlinessLabelComment(cleanScore);

  const dynamism = computeDynamismDimension(analytics);

  return {
    pace: {
      score: paceScore,
      label: paceMeta.label,
      comment: paceMeta.comment,
    },
    fluency,
    cleanliness: {
      score: cleanScore,
      label: cleanMeta.label,
      comment: cleanMeta.comment,
    },
    dynamism,
  };
}
