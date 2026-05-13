import type { DeepgramAnalytics } from './deepgram-analytics';
import {
  computeDimensionScorecard,
  type DimensionScore,
  type DimensionScorecard,
} from './dimension-scoring';

export type { DimensionScore, DimensionScorecard };
export type DeepgramCoachFeedback = DimensionScorecard;

export function generateCoachFeedback(
  analytics: DeepgramAnalytics,
): DeepgramCoachFeedback {
  return computeDimensionScorecard(analytics);
}
