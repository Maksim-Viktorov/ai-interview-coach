'use client';

import Link from 'next/link';
import { HighlightedTranscript } from '@/components/interview/highlighted-transcript';
import { EngagementSection } from '@/components/interview/engagement-section';
import { CoachFeedbackSection } from '@/components/interview/coach-ui';
import { SpeechAnalyticsSection } from '@/components/interview/speech-analytics-section';
import type { DeepgramAnalytics } from '@/lib/deepgram-analytics';
import type { DimensionScorecard } from '@/lib/dimension-scoring';
import type { GazeMetricsSnapshot } from '@/hooks/useGazeTracking';

export type SessionSummaryAnswerRow = {
  id: string;
  answer: string;
  feedback: string | null;
  delivery_scorecard: DimensionScorecard | null;
  delivery_analytics: DeepgramAnalytics | null;
  gaze_metrics: GazeMetricsSnapshot | null;
};

export type SessionSummaryPair = {
  question: { id: string; text: string };
  answer: SessionSummaryAnswerRow;
};

type SessionSummaryProps = {
  sessionCreatedAt: string;
  pairs: SessionSummaryPair[];
};

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function SessionSummary({ sessionCreatedAt, pairs }: SessionSummaryProps) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">
          Session Summary
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Completed {formatSessionDate(sessionCreatedAt)}
        </p>
      </header>

      <div className="space-y-12">
        {pairs.map((pair, index) => (
          <article key={pair.answer.id} className="space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                Question {index + 1} of {pairs.length}
              </p>
              <p className="mt-1 text-lg font-semibold text-balance text-gray-950 dark:text-white">
                {pair.question.text}
              </p>
            </div>

            <div
              className="min-h-32 w-full rounded border p-3 text-left leading-relaxed"
              aria-label="Answer transcript with filler highlights"
            >
              <HighlightedTranscript text={pair.answer.answer} />
            </div>

            <SpeechAnalyticsSection
              analytics={pair.answer.delivery_analytics}
              scorecard={pair.answer.delivery_scorecard}
            />

            <EngagementSection metrics={pair.answer.gaze_metrics} />

            <CoachFeedbackSection feedbackRaw={pair.answer.feedback} />
          </article>
        ))}
      </div>

      <div>
        <Link
          href="/"
          className="inline-block rounded bg-white px-4 py-2 text-black hover:bg-gray-200 dark:bg-gray-200"
        >
          Exit to Home
        </Link>
      </div>
    </div>
  );
}
