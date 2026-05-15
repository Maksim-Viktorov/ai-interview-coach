'use client';

import type { GazeMetricsSnapshot } from '@/hooks/useGazeTracking';

const cardShellClass =
  'flex flex-col rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-600 dark:bg-gray-950/40';

function scoreColorClass(score: number): string {
  if (score >= 85) return 'bg-emerald-500';
  if (score >= 70) return 'bg-lime-500';
  if (score >= 55) return 'bg-yellow-500';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

function engagementLabelComment(ratio: number): {
  label: string;
  comment: string;
} {
  if (ratio >= 85) {
    return {
      label: 'Strong engagement',
      comment: 'Maintained consistent eye contact throughout',
    };
  }
  if (ratio >= 70) {
    return {
      label: 'Good engagement',
      comment: 'Looked at the camera most of the time',
    };
  }
  if (ratio >= 55) {
    return {
      label: 'Moderate engagement',
      comment: 'Noticeable look-aways during your answer',
    };
  }
  return {
    label: 'Low engagement',
    comment: 'Consider keeping your gaze on the camera more',
  };
}

export type EngagementSectionProps = {
  metrics: Pick<
    GazeMetricsSnapshot,
    | 'eyeContactRatio'
    | 'lookAwayEvents'
    | 'longestLookAwayMs'
    | 'hasSufficientData'
  > | null;
};

export function EngagementSection({ metrics }: EngagementSectionProps) {
  if (metrics === null) {
    return null;
  }

  if (!metrics.hasSufficientData) {
    return (
      <section className="rounded-lg border border-gray-200 bg-gray-50/90 p-4 shadow-sm dark:border-gray-600 dark:bg-gray-900/80">
        <h3 className="text-base font-semibold tracking-tight text-gray-950 dark:text-white">
          Engagement
        </h3>
        <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
          Not enough camera data to assess engagement.
        </p>
      </section>
    );
  }

  const ratio = metrics.eyeContactRatio;
  const displayScore =
    ratio != null && Number.isFinite(ratio) ? Math.round(ratio) : 0;
  const { label, comment } =
    ratio != null && Number.isFinite(ratio)
      ? engagementLabelComment(ratio)
      : {
          label: 'Engagement',
          comment: '',
        };

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50/90 p-4 shadow-sm dark:border-gray-600 dark:bg-gray-900/80">
      <h3 className="text-base font-semibold tracking-tight text-gray-950 dark:text-white">
        Engagement
      </h3>

      <div className={`${cardShellClass} mt-4`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
          Eye contact
        </p>
        <p className="mt-2 text-3xl font-bold tabular-nums text-gray-950 dark:text-white">
          {ratio != null ? `${ratio.toFixed(1)}%` : '—'}
        </p>
        <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
          {label}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
          {comment}
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={`h-full rounded-full ${scoreColorClass(displayScore)}`}
            style={{ width: `${Math.min(100, Math.max(0, displayScore))}%` }}
          />
        </div>
      </div>

      <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
        Look-aways:{' '}
        <span className="tabular-nums font-medium text-gray-900 dark:text-gray-200">
          {metrics.lookAwayEvents}
        </span>
        {' · '}
        Longest:{' '}
        <span className="tabular-nums font-medium text-gray-900 dark:text-gray-200">
          {(metrics.longestLookAwayMs / 1000).toFixed(1)}s
        </span>
      </p>
    </section>
  );
}
