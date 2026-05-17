'use client';

import type { DeepgramAnalytics } from '@/lib/deepgram-analytics';
import { SpeakingPaceOverTimeChart } from '@/components/interview/speaking-pace-over-time-chart';

type SpeakingPaceOverTimeSectionProps = {
  analytics: DeepgramAnalytics | null;
};

export function SpeakingPaceOverTimeSection({
  analytics,
}: SpeakingPaceOverTimeSectionProps) {
  const pacingWindows = analytics?.consistency?.pacingWindows ?? [];
  if (pacingWindows.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <h3 className="font-display text-lg font-semibold text-text-primary">
        Speaking Pace Over Time
      </h3>
      <SpeakingPaceOverTimeChart pacingWindows={pacingWindows} />
    </section>
  );
}
