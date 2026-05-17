'use client';

import Link from 'next/link';
import { HighlightedTranscript } from '@/components/interview/highlighted-transcript';
import { EngagementSection } from '@/components/interview/engagement-section';
import { CoachFeedbackSection } from '@/components/interview/coach-ui';
import { SpeechAnalyticsSection } from '@/components/interview/speech-analytics-section';
import { SpeakingPaceOverTimeSection } from '@/components/interview/speaking-pace-over-time-section';
import { gradientButtonClassName } from '@/components/ui/gradient-button';
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
    <div>
      <div className="mb-12 text-center">
        <h1 className="mb-3 font-display text-4xl font-bold text-text-primary md:text-5xl">
          Session Summary
        </h1>
        <p className="font-body text-base text-text-secondary">
          Completed {formatSessionDate(sessionCreatedAt)}
        </p>
      </div>

      <div className="space-y-12">
        {pairs.map((pair, index) => (
          <section
            key={pair.answer.id}
            className="space-y-8 border-b border-border pb-12 last:border-b-0 last:pb-0"
          >
            <div>
              <p className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-brand">
                Question {index + 1} of {pairs.length}
              </p>
              <h2 className="font-display text-2xl font-bold leading-tight text-text-primary">
                {pair.question.text}
              </h2>
            </div>

            <section className="space-y-4">
              <h3 className="font-display text-lg font-semibold text-text-primary">
                Your Answer
              </h3>
              <div
                className="rounded-2xl border border-border bg-surface-soft p-6 font-body text-base leading-relaxed text-text-primary"
                aria-label="Answer transcript with filler highlights"
              >
                <HighlightedTranscript text={pair.answer.answer} />
              </div>
            </section>

            <SpeechAnalyticsSection
              analytics={pair.answer.delivery_analytics}
              scorecard={pair.answer.delivery_scorecard}
            />

            <SpeakingPaceOverTimeSection
              analytics={pair.answer.delivery_analytics}
            />

            <EngagementSection metrics={pair.answer.gaze_metrics} />

            <CoachFeedbackSection
              feedbackRaw={pair.answer.feedback}
              answerId={pair.answer.id}
            />
          </section>
        ))}
      </div>

      <div className="mt-16 flex justify-center">
        <Link href="/" className={gradientButtonClassName('large')}>
          Exit to Home
        </Link>
      </div>
    </div>
  );
}
