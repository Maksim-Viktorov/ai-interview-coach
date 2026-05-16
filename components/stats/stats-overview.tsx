'use client';

import { CARD_SHELL_CLASS } from '@/components/interview/coach-ui';
import type { StatsAggregates } from '@/lib/stats-aggregation';

type StatsOverviewProps = {
  aggregates: StatsAggregates;
};

function sessionsDisplayValue(aggregates: StatsAggregates): string {
  if (aggregates.sessionCount === 0) return '—';
  if (aggregates.completedSessionCount !== aggregates.sessionCount) {
    return `${aggregates.completedSessionCount} of ${aggregates.sessionCount}`;
  }
  return String(aggregates.sessionCount);
}

export function StatsOverview({ aggregates }: StatsOverviewProps) {
  if (aggregates.sessionCount === 0) {
    return null;
  }

  const cards = [
    {
      label: 'Sessions',
      value: sessionsDisplayValue(aggregates),
      subtitle: 'completed / total',
    },
    {
      label: 'Answers',
      value:
        aggregates.totalAnswers === 0 ? '—' : String(aggregates.totalAnswers),
      subtitle: 'across all sessions',
    },
    {
      label: 'Avg Pace',
      value:
        aggregates.avgPaceScore != null
          ? `${aggregates.avgPaceScore}/100`
          : '—',
      subtitle: 'across completed sessions',
    },
    {
      label: 'Avg Engagement',
      value:
        aggregates.avgEngagement != null
          ? `${aggregates.avgEngagement}%`
          : '—',
      subtitle: 'of camera-on answers',
    },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className={CARD_SHELL_CLASS}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
            {card.label}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-gray-950 dark:text-white">
            {card.value}
          </p>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
            {card.subtitle}
          </p>
        </div>
      ))}
    </div>
  );
}
