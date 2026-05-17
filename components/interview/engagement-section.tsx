'use client';

import type { GazeMetricsSnapshot } from '@/hooks/useGazeTracking';

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
      <section className="space-y-4">
        <h3 className="font-display text-lg font-semibold text-text-primary">
          Engagement
        </h3>
        <div className="rounded-2xl border border-border bg-surface-soft p-6">
          <p className="text-center font-body text-sm text-text-secondary">
            Not enough camera data to compute engagement metrics for this
            answer.
          </p>
        </div>
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

  const longestSeconds = (metrics.longestLookAwayMs / 1000).toFixed(1);

  return (
    <section className="space-y-4">
      <h3 className="font-display text-lg font-semibold text-text-primary">
        Engagement
      </h3>
      <div className="space-y-4 rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-display text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Eye Contact
          </span>
          <span className="font-display text-3xl font-bold tabular-nums text-text-primary">
            {ratio != null ? `${displayScore}%` : '—'}
          </span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-border">
          <div
            className={`h-full rounded-full transition-all duration-500 ${scoreColorClass(displayScore)}`}
            style={{ width: `${Math.min(100, Math.max(0, displayScore))}%` }}
          />
        </div>

        <p className="font-body text-sm font-semibold text-text-secondary">
          {label}
        </p>
        {comment ? (
          <p className="font-body text-sm text-text-primary">{comment}</p>
        ) : null}

        <div className="flex gap-6 border-t border-border pt-4 font-body text-sm">
          <div>
            <span className="text-text-secondary">Look-aways: </span>
            <span className="font-semibold text-text-primary">
              {metrics.lookAwayEvents}
            </span>
          </div>
          <div>
            <span className="text-text-secondary">Longest: </span>
            <span className="font-semibold text-text-primary">
              {longestSeconds}s
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
