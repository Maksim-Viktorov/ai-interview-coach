import type { DeepgramAnalytics } from '@/lib/deepgram-analytics';
import type { DimensionScorecard } from '@/lib/dimension-scoring';
import {
  buildFeedbackStoragePayload,
  type ParsedFeedback,
} from '@/lib/feedback-parse';
import { openai } from '@/lib/openai';

export type { ParsedFeedback };

const OPENAI_FAIL_FALLBACK: ParsedFeedback = {
  strength:
    'Feedback could not be generated, but your answer was saved.',
  improvement: '',
  suggestion: '',
};

function fillerCountFromAnalytics(analytics: DeepgramAnalytics): number {
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

export function buildMetricAwarePrompt(
  question: string,
  answer: string,
  scorecard: DimensionScorecard,
  analytics: DeepgramAnalytics,
): string {
  const fillerCount = fillerCountFromAnalytics(analytics);
  const fillerDensity =
    analytics.fillerDensityPer100Words != null
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
- Pacing shape: ${analytics.consistency?.pacingAnalysis?.shape ?? 'unknown'}
- Filler words: ${fillerCount} total (${fillerDensity} per 100 words)
- Long pauses: ${analytics.longPauseCount ?? 0}
- Answer duration: ${analytics.activeAnswerDurationSeconds != null ? analytics.activeAnswerDurationSeconds.toFixed(0) : 'unknown'} seconds

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

export type MetricAwareFeedbackResult = {
  feedbackPayload: string;
  parsed: ParsedFeedback | null;
  parseFailed: boolean;
};

export async function generateMetricAwareFeedback(
  question: string,
  answer: string,
  scorecard: DimensionScorecard,
  analytics: DeepgramAnalytics,
): Promise<MetricAwareFeedbackResult> {
  const prompt = buildMetricAwarePrompt(question, answer, scorecard, analytics);

  try {
    const response = await openai.responses.create({
      model: 'gpt-5.4-mini',
      input: prompt,
    });

    const llmRawOutput = response.output_text;
    const { feedbackPayload, parsed } = buildFeedbackStoragePayload(llmRawOutput);

    return {
      feedbackPayload,
      parsed,
      parseFailed: parsed === null,
    };
  } catch {
    const feedbackPayload = JSON.stringify(OPENAI_FAIL_FALLBACK);
    return {
      feedbackPayload,
      parsed: OPENAI_FAIL_FALLBACK,
      parseFailed: false,
    };
  }
}
