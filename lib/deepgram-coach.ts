import {
  type DeepgramAnalytics,
  pacingWindowsCv,
} from './deepgram-analytics';

export type DeepgramCoachFeedback = {
  overallScore: number;
  summary: string;
  pacing: {
    label: 'too_slow' | 'good' | 'too_fast';
    explanation: string;
  };
  pauses: {
    label: 'no_pauses' | 'light' | 'moderate' | 'heavy' | 'very_heavy';
    explanation: string;
  };
  consistency: {
    label: 'stable' | 'moderate' | 'unstable';
    explanation: string;
  };
  suggestions: string[];
};

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, score));
}

function finiteOrZero(n: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

type DominantCategory = 'pauses' | 'pacing' | 'consistency';

/** Semantic categories so equivalent tips are not duplicated (keyword-style, not ML). */
type SuggestionIntent =
  | 'long_pause_planning'
  | 'filler_pause'
  | 'dead_air_density'
  | 'pacing_slow_detail'
  | 'pacing_fast_setup'
  | 'consistency_breath';

type TaggedSuggestion = { intent: SuggestionIntent; text: string };

const STAR_SUGGESTION =
  'Practice structuring answers before speaking (STAR method: situation, task, action, result).';

const GENERIC_HIGH_SCORE_SUGGESTION =
  'End each story with a clear result or lesson so the listener gets a strong closing beat.';

const SECOND_GENERIC_SUGGESTION =
  'Skim your answer once for jargon and swap any unclear phrase for a plain-English version.';

const TIP_LONG_PAUSE =
  'Try reducing long pauses between ideas by outlining one sentence ahead before you speak.';

const TIP_FILLER =
  "Reduce filler hesitation by pausing silently instead of saying 'um' before the next idea.";

const TIP_DEAD_AIR =
  'Increase spoken density by trimming dead air: rehearse the first and last sentence of each story.';

const TIP_PACING_SLOW_DETAIL =
  'Slow slightly at key points (numbers, outcomes) so interviewers can absorb details.';

const TIP_PACING_FAST_SETUP =
  'Pick up pace slightly on setup context so you have time for impact in the conclusion.';

const TIP_CONSISTENCY_BREATH =
  'Aim for more consistent pacing between sentences—practice one steady breath per clause.';

function intentFromText(text: string): SuggestionIntent | null {
  const lower = text.toLowerCase();
  if (
    lower.includes('long pause') ||
    lower.includes('outline one sentence') ||
    lower.includes('one sentence ahead')
  ) {
    return 'long_pause_planning';
  }
  if (lower.includes('filler') || lower.includes("'um'")) {
    return 'filler_pause';
  }
  if (
    lower.includes('dead air') ||
    lower.includes('spoken density') ||
    lower.includes('trimming dead')
  ) {
    return 'dead_air_density';
  }
  if (lower.includes('slow slightly') || lower.includes('absorb details')) {
    return 'pacing_slow_detail';
  }
  if (lower.includes('pick up pace') || lower.includes('setup context')) {
    return 'pacing_fast_setup';
  }
  if (
    lower.includes('steady breath') ||
    lower.includes('consistent pacing between sentences')
  ) {
    return 'consistency_breath';
  }
  return null;
}

function mergeTaggedUnique(primary: TaggedSuggestion[], secondary: TaggedSuggestion[]) {
  const usedIntents = new Set<SuggestionIntent>();
  const ordered: string[] = [];

  function pushTagged(tagged: TaggedSuggestion) {
    if (usedIntents.has(tagged.intent)) return;
    usedIntents.add(tagged.intent);
    ordered.push(tagged.text);
  }

  for (const t of primary) {
    pushTagged(t);
  }
  for (const t of secondary) {
    pushTagged(t);
  }

  return { ordered, usedIntents };
}

export function generateCoachFeedback(
  analytics: DeepgramAnalytics,
): DeepgramCoachFeedback {
  const pauseCount = finiteOrZero(analytics.pauseCount);
  const longPauseCount = finiteOrZero(analytics.longPauseCount);
  const speechRatio = finiteOrZero(analytics.speechRatio);
  const wpmVariance = finiteOrZero(analytics.wpmVariance);
  const legacyVariance = wpmVariance;
  const speakingRateWpm = finiteOrZero(analytics.speakingRateWpm);
  const utteranceCount = Array.isArray(analytics.utterances)
    ? analytics.utterances.length
    : 0;

  const consistencyBlock = analytics.consistency;
  const pacingWindows = Array.isArray(consistencyBlock?.pacingWindows)
    ? consistencyBlock.pacingWindows
    : [];
  const pacingAnalysis = consistencyBlock?.pacingAnalysis;
  const windowCv = pacingWindowsCv(pacingWindows);
  const slope =
    pacingAnalysis &&
    typeof pacingAnalysis.trendSlope === 'number' &&
    Number.isFinite(pacingAnalysis.trendSlope)
      ? pacingAnalysis.trendSlope
      : 0;
  const windowCount = pacingWindows.length;

  const usingWindowModel = windowCv !== null && windowCount >= 3;

  console.log('[deepgram] consistency debug', {
    windowCv,
    slope,
    windowCount,
    legacyVariance,
    usingWindowModel,
  });

  // pauseCount / longPauseCount: used ONLY below for pauseScore (single source for pause penalties)
  let pauseBandDeduction = 0;
  if (pauseCount >= 1 && pauseCount <= 2) {
    pauseBandDeduction = 5;
  } else if (pauseCount >= 3 && pauseCount <= 5) {
    pauseBandDeduction = 10;
  } else if (pauseCount >= 6) {
    pauseBandDeduction = 20;
  }

  const longPauseComponent = Math.min(25, longPauseCount * 5);
  const pauseScore = Math.min(35, pauseBandDeduction + longPauseComponent);

  let varianceScore = 0;
  if (usingWindowModel && windowCv !== null) {
    if (windowCv < 0.15) {
      varianceScore = 0;
    } else if (windowCv <= 0.35) {
      varianceScore = 5;
    } else {
      varianceScore = 12;
    }
    if (Math.abs(slope) > 8) {
      varianceScore += 5;
    }
  } else {
    if (legacyVariance > 900) {
      varianceScore = 15;
    } else if (legacyVariance > 400) {
      varianceScore = 8;
    }
    if (utteranceCount < 3) {
      varianceScore = Math.min(varianceScore, 5);
    }
  }

  const totalScoreRaw = 100 - pauseScore - varianceScore;
  const overallScore = clampScore(totalScoreRaw);

  let pacingLabel: DeepgramCoachFeedback['pacing']['label'];
  let pacingExplanation: string;

  if (speakingRateWpm < 150) {
    pacingLabel = 'too_slow';
    pacingExplanation = `Speaking rate is below 150 WPM (${speakingRateWpm.toFixed(0)} WPM) — you may sound uncertain or under-prepared.`;
  } else if (speakingRateWpm > 230) {
    pacingLabel = 'too_fast';
    pacingExplanation = `Speaking rate is above 230 WPM (${speakingRateWpm.toFixed(0)} WPM) — you may be rushing or hard to follow.`;
  } else {
    pacingLabel = 'good';
    pacingExplanation = `Overall pacing is in a comfortable range (${speakingRateWpm.toFixed(0)} WPM): clear, confident, and easy to follow.`;
  }

  const pacingDeviationWeight = pacingLabel === 'good' ? 0 : 15;

  let pausesLabel: DeepgramCoachFeedback['pauses']['label'];
  let pausesExplanation: string;

  if (longPauseCount > 2 || pauseCount >= 7) {
    pausesLabel = 'very_heavy';
    pausesExplanation = `Pause load is high (${pauseCount} notable gaps, ${longPauseCount} long pauses), which can interrupt flow and signal hesitation.`;
  } else if (pauseCount <= 1) {
    pausesLabel = pauseCount === 0 ? 'no_pauses' : 'light';
    pausesExplanation =
      pauseCount === 0
        ? 'Few or no measured pauses above the threshold; delivery may sound continuous.'
        : `Only one notable pause (${pauseCount}); transitions look fairly smooth.`;
  } else if (pauseCount >= 2 && pauseCount <= 3) {
    pausesLabel = 'moderate';
    pausesExplanation = `There are a few noticeable pauses (${pauseCount}); they may feel natural or slightly hesitant depending on context.`;
  } else {
    pausesLabel = 'heavy';
    pausesExplanation = `Several pauses (${pauseCount}) appear between ideas; listeners may perceive hesitation or uneven rhythm.`;
  }

  let consistencyLabel: DeepgramCoachFeedback['consistency']['label'];
  let consistencyExplanation: string;

  if (usingWindowModel && windowCv !== null) {
    if (windowCv < 0.15) {
      consistencyLabel = 'stable';
      consistencyExplanation = `Overlapping word-window pacing is fairly steady through the answer (CV ${windowCv.toFixed(2)} across ${windowCount} samples).`;
    } else if (windowCv <= 0.35) {
      consistencyLabel = 'moderate';
      consistencyExplanation = `Moderate pacing variation across sliding windows (CV ${windowCv.toFixed(2)} across ${windowCount} samples); delivery should still feel acceptable.`;
    } else {
      consistencyLabel = 'unstable';
      consistencyExplanation = `Pacing swings strongly across overlapping windows (CV ${windowCv.toFixed(2)} across ${windowCount} samples), which tends to sound uneven.`;
    }
    if (Number.isFinite(slope) && Math.abs(slope) > 8) {
      consistencyExplanation += ` Rapid change in tempo over time is also evident (trend slope ${slope >= 0 ? '+' : ''}${slope.toFixed(2)} WPM per window step).`;
    }
  } else if (utteranceCount < 3) {
    if (wpmVariance > 900) {
      consistencyLabel = 'moderate';
      consistencyExplanation = `Variance is elevated (${wpmVariance.toFixed(0)}), but with fewer than three utterances this is only moderately informative—not enough data to label delivery as unstable.`;
    } else if (wpmVariance < 200) {
      consistencyLabel = 'stable';
      consistencyExplanation = `Utterance-level pacing looks steady (variance ${wpmVariance.toFixed(0)}). Few phrases were analyzed, so treat this as directional.`;
    } else {
      consistencyLabel = 'moderate';
      consistencyExplanation = `Some fluctuation between phrases (variance ${wpmVariance.toFixed(0)}); with fewer than three utterances, consistency is harder to judge reliably.`;
    }
  } else if (wpmVariance < 200) {
    consistencyLabel = 'stable';
    consistencyExplanation = `Utterance-level pacing is fairly steady (variance ${wpmVariance.toFixed(0)}).`;
  } else if (wpmVariance <= 600) {
    consistencyLabel = 'moderate';
    consistencyExplanation = `Some fluctuation between phrases (variance ${wpmVariance.toFixed(0)}); delivery is acceptable but not perfectly even.`;
  } else {
    consistencyLabel = 'unstable';
    consistencyExplanation = `Large swings between faster and slower phrases (variance ${wpmVariance.toFixed(0)}), which often reads as nervous or uneven delivery.`;
  }

  if (
    pacingAnalysis?.shape === 'insufficient' &&
    pacingWindows.length > 0 &&
    pacingWindows.length < 5
  ) {
    consistencyExplanation += ` Few overlapping word windows (${pacingWindows.length}); full pacing analysis needs more samples.`;
  }

  let pacingSentence: string;
  if (pacingLabel === 'too_slow') {
    pacingSentence =
      'Your overall speaking pace is below the comfortable interview band (under 150 WPM).';
  } else if (pacingLabel === 'too_fast') {
    pacingSentence =
      'Your overall speaking pace is above the comfortable band (over 230 WPM), which can sound rushed.';
  } else {
    pacingSentence =
      'Your overall speaking pace sits in the comfortable 150–230 WPM range for most listeners.';
  }

  let pauseSentence: string;
  if (pausesLabel === 'no_pauses' || pausesLabel === 'light') {
    pauseSentence =
      'Pause patterns look relatively light, so hesitations are unlikely to dominate the impression.';
  } else if (pausesLabel === 'moderate') {
    pauseSentence =
      'There are a few mid-answer pauses that may feel natural or slightly hesitant.';
  } else if (pausesLabel === 'heavy') {
    pauseSentence =
      'Several pauses appear between ideas, which can interrupt flow if they stack up.';
  } else {
    pauseSentence =
      'Frequent or long pauses show up in this answer, which can signal hesitation or difficulty structuring thoughts.';
  }

  let consistencySentence: string;
  if (consistencyLabel === 'stable') {
    consistencySentence =
      'Delivery consistency across utterances is fairly stable.';
  } else if (consistencyLabel === 'moderate') {
    consistencySentence =
      'Some unevenness shows up between phrases, but it is not extreme.';
  } else {
    consistencySentence =
      'Pacing consistency across phrases is weak, with noticeable speed swings.';
  }

  const summary = [pacingSentence, pauseSentence, consistencySentence].join(
    ' ',
  );

  const pauseWeight = pauseScore;
  const pacingWeight = pacingDeviationWeight;
  const consistencyWeight = varianceScore;

  let dominant: DominantCategory;
  if (pauseWeight >= pacingWeight && pauseWeight >= consistencyWeight) {
    dominant = 'pauses';
  } else if (pacingWeight >= consistencyWeight) {
    dominant = 'pacing';
  } else {
    dominant = 'consistency';
  }

  const primaryTagged: TaggedSuggestion[] = [];
  const secondaryTagged: TaggedSuggestion[] = [];

  if (dominant === 'pauses') {
    if (longPauseCount > 0) {
      primaryTagged.push({
        intent: 'long_pause_planning',
        text: TIP_LONG_PAUSE,
      });
    }
    if (pausesLabel === 'heavy' || pausesLabel === 'very_heavy') {
      primaryTagged.push({ intent: 'filler_pause', text: TIP_FILLER });
    }
  } else if (dominant === 'pacing') {
    if (pacingLabel === 'too_fast') {
      primaryTagged.push({
        intent: 'pacing_slow_detail',
        text: TIP_PACING_SLOW_DETAIL,
      });
    } else if (pacingLabel === 'too_slow') {
      primaryTagged.push({
        intent: 'pacing_fast_setup',
        text: TIP_PACING_FAST_SETUP,
      });
    }
  } else {
    if (wpmVariance > 400) {
      primaryTagged.push({
        intent: 'consistency_breath',
        text: TIP_CONSISTENCY_BREATH,
      });
    }
  }

  if (dominant !== 'pauses') {
    if (longPauseCount > 0) {
      secondaryTagged.push({
        intent: 'long_pause_planning',
        text: TIP_LONG_PAUSE,
      });
    }
    if (pausesLabel === 'heavy' || pausesLabel === 'very_heavy') {
      secondaryTagged.push({ intent: 'filler_pause', text: TIP_FILLER });
    }
  }

  if (dominant !== 'pacing') {
    if (pacingLabel === 'too_fast') {
      secondaryTagged.push({
        intent: 'pacing_slow_detail',
        text: TIP_PACING_SLOW_DETAIL,
      });
    } else if (pacingLabel === 'too_slow') {
      secondaryTagged.push({
        intent: 'pacing_fast_setup',
        text: TIP_PACING_FAST_SETUP,
      });
    }
  }

  if (dominant !== 'consistency' && wpmVariance > 400) {
    secondaryTagged.push({
      intent: 'consistency_breath',
      text: TIP_CONSISTENCY_BREATH,
    });
  }

  const { ordered: mergedCore, usedIntents } = mergeTaggedUnique(
    primaryTagged,
    secondaryTagged,
  );

  let suggestionsPipeline = [...mergedCore];

  if (speechRatio < 0.75 && !usedIntents.has('dead_air_density')) {
    suggestionsPipeline.push(TIP_DEAD_AIR);
    usedIntents.add('dead_air_density');
  }

  const dedupedByIntent: string[] = [];
  const seenIntentFinal = new Set<SuggestionIntent>();
  for (const line of suggestionsPipeline) {
    const inferred = intentFromText(line);
    if (inferred !== null) {
      if (seenIntentFinal.has(inferred)) continue;
      seenIntentFinal.add(inferred);
    }
    dedupedByIntent.push(line);
  }
  suggestionsPipeline = dedupedByIntent;

  if (suggestionsPipeline.length < 2) {
    if (overallScore < 80) {
      if (!suggestionsPipeline.includes(STAR_SUGGESTION)) {
        suggestionsPipeline.push(STAR_SUGGESTION);
      }
      if (
        suggestionsPipeline.length < 2 &&
        !suggestionsPipeline.includes(GENERIC_HIGH_SCORE_SUGGESTION)
      ) {
        suggestionsPipeline.push(GENERIC_HIGH_SCORE_SUGGESTION);
      }
    } else {
      if (!suggestionsPipeline.includes(GENERIC_HIGH_SCORE_SUGGESTION)) {
        suggestionsPipeline.push(GENERIC_HIGH_SCORE_SUGGESTION);
      }
      if (
        suggestionsPipeline.length < 2 &&
        !suggestionsPipeline.includes(SECOND_GENERIC_SUGGESTION)
      ) {
        suggestionsPipeline.push(SECOND_GENERIC_SUGGESTION);
      }
    }
  }

  const suggestionsFinal = suggestionsPipeline.slice(0, 4);

  return {
    overallScore,
    summary,
    pacing: { label: pacingLabel, explanation: pacingExplanation },
    pauses: { label: pausesLabel, explanation: pausesExplanation },
    consistency: {
      label: consistencyLabel,
      explanation: consistencyExplanation,
    },
    suggestions: suggestionsFinal,
  };
}
