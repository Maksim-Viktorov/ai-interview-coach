import {
  isValidGazeMetrics,
  isValidScorecard,
} from '@/lib/session-summary';

export type SessionDbRow = {
  id: string;
  created_at: string;
  question_ids: string[] | null;
  interview_type: string;
};

export type AnswerDbRow = {
  id: string;
  session_id: string;
  question_id: string | null;
  delivery_scorecard: unknown;
  gaze_metrics: unknown;
  created_at: string;
};

export type SessionRow = {
  id: string;
  createdAt: string;
  isComplete: boolean;
  answeredCount: number;
  questionCount: number;
};

export type StatsAggregates = {
  sessionCount: number;
  completedSessionCount: number;
  totalAnswers: number;
  avgPaceScore: number | null;
  avgEngagement: number | null;
};

function roundAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round(sum / values.length);
}

export function deriveSessionRows(
  sessions: SessionDbRow[],
  answers: AnswerDbRow[],
): SessionRow[] {
  return sessions.map((session) => {
    const questionCount = Array.isArray(session.question_ids)
      ? session.question_ids.length
      : 0;
    const answeredCount = answers.filter(
      (a) => a.session_id === session.id,
    ).length;
    const isComplete =
      questionCount > 0 && answeredCount >= questionCount;

    return {
      id: session.id,
      createdAt: session.created_at,
      isComplete,
      answeredCount,
      questionCount,
    };
  });
}

export function computeAggregates(
  sessions: SessionDbRow[],
  answers: AnswerDbRow[],
): StatsAggregates {
  const sessionRows = deriveSessionRows(sessions, answers);
  const completedSessionIds = new Set(
    sessionRows.filter((r) => r.isComplete).map((r) => r.id),
  );

  const paceScores: number[] = [];
  const engagementScores: number[] = [];

  for (const answer of answers) {
    if (!completedSessionIds.has(answer.session_id)) continue;

    if (isValidScorecard(answer.delivery_scorecard)) {
      const score = answer.delivery_scorecard.pace.score;
      if (typeof score === 'number' && Number.isFinite(score)) {
        paceScores.push(score);
      }
    }

    if (isValidGazeMetrics(answer.gaze_metrics)) {
      const gaze = answer.gaze_metrics;
      if (
        gaze.hasSufficientData &&
        gaze.eyeContactRatio != null &&
        Number.isFinite(gaze.eyeContactRatio)
      ) {
        engagementScores.push(gaze.eyeContactRatio);
      }
    }
  }

  const sessionCount = sessions.length;
  const completedSessionCount = sessionRows.filter((r) => r.isComplete).length;

  return {
    sessionCount,
    completedSessionCount,
    totalAnswers: answers.length,
    avgPaceScore: roundAverage(paceScores),
    avgEngagement: roundAverage(engagementScores),
  };
}
