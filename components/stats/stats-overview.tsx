'use client';

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
      label: 'Pace',
      value:
        aggregates.avgPaceScore != null
          ? `${aggregates.avgPaceScore}/100`
          : '—',
      subtitle: 'across completed sessions',
    },
    {
      label: 'Engagement',
      value:
        aggregates.avgEngagement != null
          ? `${aggregates.avgEngagement}%`
          : '—',
      subtitle: 'of camera-on answers',
    },
  ] as const;

  return (
    <div className="mb-16 grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="space-y-2 rounded-2xl border border-border bg-surface p-6 text-center"
        >
          <p className="font-display text-sm font-semibold uppercase tracking-wide text-text-secondary">
            {card.label}
          </p>
          <p className="bg-gradient-to-r from-brand-gradient-start to-brand-gradient-end bg-clip-text font-display text-3xl font-bold tabular-nums text-transparent">
            {card.value}
          </p>
          <p className="font-body text-sm text-text-secondary">
            {card.subtitle}
          </p>
        </div>
      ))}
    </div>
  );
}
