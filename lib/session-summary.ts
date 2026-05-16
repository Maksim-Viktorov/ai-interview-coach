import type { DeepgramAnalytics } from '@/lib/deepgram-analytics';
import type { DimensionScorecard } from '@/lib/dimension-scoring';
import type { GazeMetricsSnapshot } from '@/hooks/useGazeTracking';
import type { SessionSummaryPair } from '@/components/interview/session-summary';

export type AnswerDbRow = {
  id: string;
  question: string;
  question_id: string | null;
  answer: string;
  feedback: string | null;
  delivery_scorecard: unknown;
  delivery_analytics: unknown;
  gaze_metrics: unknown;
};

export type QuestionRow = { id: string; text: string };

function isValidScorecard(s: unknown): s is DimensionScorecard {
  if (!s || typeof s !== 'object') return false;
  const sc = s as Record<string, unknown>;
  return (
    typeof sc.pace === 'object' &&
    sc.pace !== null &&
    typeof sc.fluency === 'object' &&
    sc.fluency !== null &&
    typeof sc.cleanliness === 'object' &&
    sc.cleanliness !== null &&
    typeof sc.dynamism === 'object' &&
    sc.dynamism !== null
  );
}

function isValidGazeMetrics(v: unknown): v is GazeMetricsSnapshot {
  if (v == null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    (o.eyeContactRatio === null || typeof o.eyeContactRatio === 'number') &&
    typeof o.lookAwayEvents === 'number' &&
    Number.isFinite(o.lookAwayEvents) &&
    typeof o.longestLookAwayMs === 'number' &&
    Number.isFinite(o.longestLookAwayMs) &&
    typeof o.totalFaceDetectedMs === 'number' &&
    Number.isFinite(o.totalFaceDetectedMs) &&
    typeof o.hasSufficientData === 'boolean'
  );
}

export function isValidDeepgramAnalytics(v: unknown): v is DeepgramAnalytics {
  if (v == null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.speakingRateWpm !== 'number' || !Number.isFinite(o.speakingRateWpm)) {
    return false;
  }
  const consistency = o.consistency;
  if (consistency == null || typeof consistency !== 'object') return false;
  const c = consistency as Record<string, unknown>;
  if (!Array.isArray(c.pacingWindows)) return false;
  if (c.pacingAnalysis == null || typeof c.pacingAnalysis !== 'object') {
    return false;
  }
  return true;
}

export function buildSessionSummaryPairs(
  orderedQuestions: QuestionRow[],
  answers: AnswerDbRow[],
): SessionSummaryPair[] | null {
  if (answers.length < 3 || orderedQuestions.length !== 3) {
    return null;
  }

  const pairs: SessionSummaryPair[] = [];

  for (const q of orderedQuestions) {
    const row =
      answers.find((a) => a.question_id === q.id) ??
      answers.find((a) => a.question === q.text);

    if (!row) {
      return null;
    }

    pairs.push({
      question: { id: q.id, text: q.text },
      answer: {
        id: row.id,
        answer: row.answer,
        feedback: row.feedback,
        delivery_scorecard: isValidScorecard(row.delivery_scorecard)
          ? row.delivery_scorecard
          : null,
        delivery_analytics: isValidDeepgramAnalytics(row.delivery_analytics)
          ? row.delivery_analytics
          : null,
        gaze_metrics: isValidGazeMetrics(row.gaze_metrics)
          ? row.gaze_metrics
          : null,
      },
    });
  }

  if (pairs.length !== 3) {
    return null;
  }

  return pairs;
}
