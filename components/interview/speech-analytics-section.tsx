'use client';

import type { DeepgramAnalytics } from '@/lib/deepgram-analytics';
import type { DimensionScorecard } from '@/lib/dimension-scoring';
import {
  DimensionScoreCard,
  pacingCurveDescriptor,
} from '@/components/interview/coach-ui';

type SpeechAnalyticsSectionProps = {
  analytics: DeepgramAnalytics | null;
  scorecard: DimensionScorecard | null;
};

export function SpeechAnalyticsSection({
  analytics,
  scorecard,
}: SpeechAnalyticsSectionProps) {
  if (!analytics && !scorecard) {
    return null;
  }

  const wpmFinite =
    analytics != null && Number.isFinite(analytics.speakingRateWpm);
  const wpmValue = wpmFinite ? Math.round(analytics!.speakingRateWpm) : null;

  const pa = analytics?.consistency?.pacingAnalysis;
  const curve = pa != null ? pacingCurveDescriptor(pa.shape) : null;
  const dynamismFooter =
    curve == null ? null : (
      <div className="font-body text-xs leading-relaxed text-text-secondary">
        <p className="font-medium text-text-primary">
          Curve shape: {curve.label}
        </p>
        <p className="mt-0.5">{curve.helper}</p>
      </div>
    );

  return (
    <section className="space-y-4">
      <h3 className="font-display text-lg font-semibold text-text-primary">
        Speech Analytics
      </h3>

      {wpmValue != null ? (
        <div className="flex items-baseline gap-3">
          <span className="font-display text-4xl font-bold tabular-nums text-text-primary">
            {wpmValue}
          </span>
          <span className="font-body text-base text-text-secondary">
            WPM
          </span>
        </div>
      ) : null}

      {scorecard ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <DimensionScoreCard title="Pace" dim={scorecard.pace} />
          <DimensionScoreCard title="Fluency" dim={scorecard.fluency} />
          <DimensionScoreCard title="Cleanliness" dim={scorecard.cleanliness} />
          <DimensionScoreCard
            title="Dynamism"
            dim={scorecard.dynamism}
            footer={analytics ? dynamismFooter : undefined}
          />
        </div>
      ) : analytics ? (
        <p className="font-body text-sm text-text-secondary">
          Delivery scorecard was not returned for this transcription.
        </p>
      ) : null}
    </section>
  );
}
