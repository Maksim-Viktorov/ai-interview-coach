import { NextResponse } from 'next/server';
import type { DeepgramAnalytics } from '@/lib/deepgram-analytics';
import type { DimensionScorecard } from '@/lib/dimension-scoring';
import { requireAuthUser } from '@/lib/auth-api';
import { generateMetricAwareFeedback } from '@/lib/feedback-llm';
import { isValidDeepgramAnalytics } from '@/lib/session-summary';

type SpeechMetricsPayload = {
  wordCount: number;
  durationSeconds: number;
  wordsPerMinute: number;
  paceFeedback: string;
  fillerCount: number;
  fillerFeedback: string;
};

type GazeMetricsPayload = {
  eyeContactRatio: number | null;
  lookAwayEvents: number;
  longestLookAwayMs: number;
  totalFaceDetectedMs: number;
  hasSufficientData: boolean;
};

type AnswersRequestBody = {
  sessionId?: string;
  question?: string;
  questionId?: string;
  answer?: string;
  speechMetrics?: SpeechMetricsPayload | null;
  scorecard?: unknown;
  analytics?: DeepgramAnalytics | null;
  gazeMetrics?: unknown;
};

function isValidGazeMetrics(v: unknown): v is GazeMetricsPayload {
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

export async function POST(request: Request) {
  const auth = await requireAuthUser();
  if ('error' in auth) {
    return auth.error;
  }
  const { user, supabase } = auth;

  const body = (await request.json()) as AnswersRequestBody;

  const {
    sessionId,
    question,
    questionId,
    answer,
    speechMetrics,
    scorecard,
    analytics,
    gazeMetrics,
  } = body;

  if (!sessionId || !question || !answer) {
    return NextResponse.json(
      { error: 'sessionId, question, and answer are required' },
      { status: 400 },
    );
  }

  if (!questionId) {
    return NextResponse.json(
      { error: 'questionId is required' },
      { status: 400 },
    );
  }

  if (
    analytics == null ||
    !isValidDeepgramAnalytics(analytics) ||
    scorecard == null ||
    !isValidScorecard(scorecard)
  ) {
    return NextResponse.json(
      { error: 'Audio recording required' },
      { status: 400 },
    );
  }

  const resolvedScorecard = scorecard;
  const resolvedAnalytics = analytics;

  let resolvedGaze: GazeMetricsPayload | null = null;
  if (gazeMetrics !== undefined && gazeMetrics !== null) {
    if (isValidGazeMetrics(gazeMetrics)) {
      resolvedGaze = gazeMetrics;
    } else {
      console.warn(
        '[answers] malformed gazeMetrics in request body — storing null',
      );
    }
  }

  const { feedbackPayload, parsed, parseFailed } =
    await generateMetricAwareFeedback(
      question,
      answer,
      resolvedScorecard,
      resolvedAnalytics,
    );

  const { data, error } = await supabase
    .from('interview_answers')
    .upsert(
      {
        session_id: sessionId,
        user_id: user.id,
        question,
        question_id: questionId,
        answer,
        feedback: feedbackPayload,
        speech_metrics: speechMetrics ?? null,
        delivery_scorecard: resolvedScorecard,
        delivery_analytics: resolvedAnalytics,
        gaze_metrics: resolvedGaze,
      },
      { onConflict: 'session_id,question_id' },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    answerId: data.id,
    feedback: feedbackPayload,
    parsed,
    parseFailed,
  });
}
