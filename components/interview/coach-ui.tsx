'use client';

import type { ReactNode } from 'react';
import type { PacingAnalysis } from '@/lib/deepgram-analytics';
import type { DimensionScore } from '@/lib/deepgram-coach';

const cardShellClass =
  'flex flex-col rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-600 dark:bg-gray-950/40';

const coachCardShellClass =
  'flex flex-col rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-600 dark:bg-gray-950/40';

function scoreColorClass(score: number): string {
  if (score >= 85) return 'bg-emerald-500';
  if (score >= 70) return 'bg-lime-500';
  if (score >= 55) return 'bg-yellow-500';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

export function DimensionScoreCard({
  title,
  dim,
  footer,
}: {
  title: string;
  dim: DimensionScore;
  footer?: ReactNode;
}) {
  return (
    <div className={cardShellClass}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
        {title}
      </p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-gray-950 dark:text-white">
        {dim.score === null ? '—' : dim.score}
      </p>
      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
        {dim.label}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
        {dim.comment}
      </p>
      {dim.score !== null ? (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={`h-full rounded-full ${scoreColorClass(dim.score)}`}
            style={{ width: `${dim.score}%` }}
          />
        </div>
      ) : null}
      {footer ? (
        <div className="mt-3 border-t border-gray-100 pt-2 dark:border-gray-700">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export type CoachFeedbackCardVariant = 'strength' | 'improvement' | 'suggestion';

const coachFeedbackAccentClass: Record<CoachFeedbackCardVariant, string> = {
  strength: 'border-t-2 border-emerald-500',
  improvement: 'border-t-2 border-amber-500',
  suggestion: 'border-t-2 border-blue-500',
};

export function CoachFeedbackCard({
  variant,
  title,
  body,
}: {
  variant: CoachFeedbackCardVariant;
  title: string;
  body: string;
}) {
  return (
    <div
      className={`${coachCardShellClass} min-h-[160px] ${coachFeedbackAccentClass[variant]}`}
    >
      <p className="mb-2 text-lg font-semibold text-foreground">{title}</p>
      <p className="text-base leading-relaxed text-foreground">{body}</p>
    </div>
  );
}

export function pacingCurveDescriptor(shape: PacingAnalysis['shape']): {
  label: string;
  helper: string;
} | null {
  switch (shape) {
    case 'insufficient':
      return null;
    case 'steady':
      return {
        label: 'Steady',
        helper: 'Consistent pace throughout, easy to follow',
      };
    case 'accelerating':
      return {
        label: 'Accelerating',
        helper: 'You built momentum, good energy',
      };
    case 'decelerating':
      return {
        label: 'Decelerating',
        helper:
          'You slowed toward the end, make sure your conclusion lands',
      };
    case 'strong-start':
      return {
        label: 'Front-loaded',
        helper:
          'You opened strongly then settled into a slower pace',
      };
    case 'strong-finish':
      return {
        label: 'Back-loaded',
        helper: 'You warmed up as you went',
      };
    case 'wave':
      return {
        label: 'Variable',
        helper: 'Rhythmic pace variation, natural emphasis',
      };
    case 'erratic':
      return {
        label: 'Erratic',
        helper:
          'Your pace varied unpredictably, work on smoother transitions',
      };
    default:
      return null;
  }
}

export type ParsedFeedbackDisplay =
  | { kind: 'structured'; strength: string; improvement: string; suggestion: string }
  | { kind: 'raw'; text: string }
  | { kind: 'none' };

export function parseFeedbackDisplay(raw: string | null): ParsedFeedbackDisplay {
  if (raw == null || raw.trim() === '') return { kind: 'none' };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { kind: 'raw', text: raw };
    }
    const obj = parsed as Record<string, unknown>;
    const strength =
      typeof obj.strength === 'string' ? obj.strength : undefined;
    const improvement =
      typeof obj.improvement === 'string' ? obj.improvement : undefined;
    const suggestion =
      typeof obj.suggestion === 'string' ? obj.suggestion : undefined;
    if (strength == null && improvement == null && suggestion == null) {
      return { kind: 'raw', text: raw };
    }
    return {
      kind: 'structured',
      strength: strength ?? '',
      improvement: improvement ?? '',
      suggestion: suggestion ?? '',
    };
  } catch {
    return { kind: 'raw', text: raw };
  }
}

export function CoachFeedbackSection({ feedbackRaw }: { feedbackRaw: string | null }) {
  const fb = parseFeedbackDisplay(feedbackRaw);

  if (fb.kind === 'none') {
    return null;
  }

  if (fb.kind === 'structured') {
    return (
      <section className="rounded-lg border border-gray-200 bg-gray-50/90 p-4 shadow-sm dark:border-gray-600 dark:bg-gray-900/80">
        <h3 className="text-base font-semibold tracking-tight text-gray-950 dark:text-white">
          Coach Feedback
        </h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <CoachFeedbackCard
            variant="strength"
            title="Strength"
            body={fb.strength}
          />
          <CoachFeedbackCard
            variant="improvement"
            title="Improvement"
            body={fb.improvement}
          />
          <CoachFeedbackCard
            variant="suggestion"
            title="Suggestion"
            body={fb.suggestion}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50/90 p-4 shadow-sm dark:border-gray-600 dark:bg-gray-900/80">
      <h3 className="text-base font-semibold tracking-tight text-gray-950 dark:text-white">
        Coach Feedback
      </h3>
      <div className="mt-4 space-y-1.5">
        <p className="text-base leading-relaxed text-foreground whitespace-pre-wrap break-words">
          {fb.text}
        </p>
      </div>
    </section>
  );
}
