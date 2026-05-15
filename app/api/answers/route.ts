import { NextResponse } from 'next/server';
import type { DeepgramAnalytics } from '@/lib/deepgram-analytics';
import type { DimensionScorecard } from '@/lib/dimension-scoring';
import { openai } from '@/lib/openai';
import { supabaseServer } from '@/lib/supabase-server';

type SpeechMetricsPayload = {
  wordCount: number;
  durationSeconds: number;
  wordsPerMinute: number;
  paceFeedback: string;
  fillerCount: number;
  fillerFeedback: string;
};

type AnswersRequestBody = {
  sessionId?: string;
  question?: string;
  answer?: string;
  speechMetrics?: SpeechMetricsPayload | null;
  scorecard?: unknown;
  analytics?: DeepgramAnalytics | null;
};

const FEEDBACK_PARSE_FALLBACK = {
  strength: 'Could not parse feedback',
  improvement: '',
  suggestion: '',
};

const OPENAI_FAIL_FALLBACK = {
  strength:
    'Feedback could not be generated, but your answer was saved.',
  improvement: '',
  suggestion: '',
};

type ParsedFeedback = {
  strength: string;
  improvement: string;
  suggestion: string;
};

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

function fillerCountFromAnalytics(
  analytics: DeepgramAnalytics | null | undefined,
): number {
  if (!analytics) return 0;
  const ext = analytics as DeepgramAnalytics & { fillerCount?: number };
  if (typeof ext.fillerCount === 'number' && Number.isFinite(ext.fillerCount)) {
    return ext.fillerCount;
  }
  if (analytics.totalWords > 0) {
    return Math.round(
      (analytics.fillerDensityPer100Words / 100) * analytics.totalWords,
    );
  }
  return 0;
}

function buildMetricAwarePrompt(
  question: string,
  answer: string,
  scorecard: DimensionScorecard,
  analytics: DeepgramAnalytics | null | undefined,
): string {
  const fillerCount = fillerCountFromAnalytics(analytics);
  const fillerDensity =
    analytics?.fillerDensityPer100Words != null
      ? analytics.fillerDensityPer100Words.toFixed(1)
      : '0';

  return `You are an experienced behavioral interview coach reviewing a candidate's answer. You have both the transcript and objective delivery metrics from their recording.

Your job: provide feedback that combines content quality with how it was delivered. A great answer poorly delivered, or a weak answer delivered confidently, are both worth addressing. Do not restate the metric numbers in your output — interpret what they suggest about the candidate's delivery.

QUESTION:
${question}

ANSWER (transcript):
${answer}

DELIVERY METRICS:
- Pace: ${scorecard.pace.score}/100 (${scorecard.pace.label})
- Fluency: ${scorecard.fluency.score ?? 'N/A'}/100 (${scorecard.fluency.label})
- Cleanliness: ${scorecard.cleanliness.score}/100 (${scorecard.cleanliness.label})
- Dynamism: ${scorecard.dynamism.score ?? 'N/A'}/100 (${scorecard.dynamism.label})
- Pacing shape: ${analytics?.consistency?.pacingAnalysis?.shape ?? 'unknown'}
- Filler words: ${fillerCount} total (${fillerDensity} per 100 words)
- Long pauses: ${analytics?.longPauseCount ?? 0}
- Answer duration: ${analytics?.activeAnswerDurationSeconds != null ? analytics.activeAnswerDurationSeconds.toFixed(0) : 'unknown'} seconds

Return JSON in this exact format:
{
  "strength": string,
  "improvement": string,
  "suggestion": string
}

Guidelines for each field:
- strength: One specific thing that worked, ideally connecting both content and delivery
- improvement: The single most important thing to fix, with concrete advice tied to either content or delivery
- suggestion: A specific actionable tactic to try next time

Each field: 30 to 60 words. Be specific. Reference the actual content of their answer, not generic interview advice. Do not restate the metric numbers — interpret them.`;
}

function buildContentOnlyPrompt(question: string, answer: string): string {
  return `You are an experienced behavioral interview coach. Analyze this written answer and provide feedback on content only.

QUESTION:
${question}

ANSWER:
${answer}

Return JSON in this exact format:
{
  "strength": string,
  "improvement": string,
  "suggestion": string
}

Each field: 30 to 60 words. Be specific and reference the actual content. Do not give generic interview advice.`;
}

export async function POST(request: Request) {
  const body = (await request.json()) as AnswersRequestBody;

  const { sessionId, question, answer, speechMetrics, scorecard, analytics } =
    body;

  if (!sessionId || !question || !answer) {
    return NextResponse.json(
      { error: 'sessionId, question, and answer are required' },
      { status: 400 },
    );
  }

  let resolvedScorecard: DimensionScorecard | null = null;
  if (scorecard !== undefined && scorecard !== null) {
    if (isValidScorecard(scorecard)) {
      resolvedScorecard = scorecard;
    } else {
      console.warn(
        '[answers] malformed scorecard in request body, using content-only prompt',
      );
    }
  }

  const prompt = resolvedScorecard
    ? buildMetricAwarePrompt(question, answer, resolvedScorecard, analytics)
    : buildContentOnlyPrompt(question, answer);

  let parsed: ParsedFeedback;

  try {
    const response = await openai.responses.create({
      model: 'gpt-5.4-mini',
      input: prompt,
    });

    try {
      parsed = JSON.parse(response.output_text) as ParsedFeedback;
    } catch {
      parsed = FEEDBACK_PARSE_FALLBACK;
    }
  } catch {
    parsed = OPENAI_FAIL_FALLBACK;
  }

  const feedback = JSON.stringify(parsed);

  const { data, error } = await supabaseServer
    .from('interview_answers')
    .insert([
      {
        session_id: sessionId,
        question,
        answer,
        feedback,
        speech_metrics: speechMetrics ?? null,
        delivery_scorecard: resolvedScorecard,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ answer: data, feedback: parsed });
}
