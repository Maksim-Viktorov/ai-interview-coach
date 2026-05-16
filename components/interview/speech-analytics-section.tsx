'use client';

import type { DeepgramAnalytics } from '@/lib/deepgram-analytics';
import type { DimensionScorecard } from '@/lib/dimension-scoring';
import { SpeakingPaceOverTimeChart } from '@/components/interview/speaking-pace-over-time-chart';
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
  const wpmHeadline = wpmFinite
    ? `${Math.round(analytics!.speakingRateWpm)} WPM`
    : '—';

  const pa = analytics?.consistency?.pacingAnalysis;
  const curve = pa != null ? pacingCurveDescriptor(pa.shape) : null;
  const paceOverTimeData =
    analytics?.consistency?.pacingWindows.map((p) => ({
      time: p.midTime,
      wpm: p.wpm,
    })) ?? [];

  const dynamismFooter =
    curve == null ? null : (
      <div className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
        <p className="font-medium text-gray-800 dark:text-gray-200">
          Curve shape: {curve.label}
        </p>
        <p className="mt-0.5">{curve.helper}</p>
      </div>
    );

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50/90 p-4 shadow-sm dark:border-gray-600 dark:bg-gray-900/80">
      <h3 className="text-base font-semibold tracking-tight text-gray-950 dark:text-white">
        Speech Analytics
      </h3>

      {analytics ? (
        <div className="mt-4 flex flex-wrap items-baseline gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
            Speaking rate
          </span>
          <span className="text-lg font-bold tabular-nums text-gray-950 dark:text-white">
            {wpmHeadline}
          </span>
        </div>
      ) : null}

      {scorecard ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
          Delivery scorecard was not returned for this transcription.
        </p>
      ) : null}

      {analytics && paceOverTimeData.length > 0 ? (
        <div className="mt-6">
          <SpeakingPaceOverTimeChart data={paceOverTimeData} />
        </div>
      ) : null}
    </section>
  );
}
