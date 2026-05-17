'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { PacingAnalysis } from '@/lib/deepgram-analytics';
import type { DimensionScore } from '@/lib/deepgram-coach';
import { isFeedbackParseErrorPayload } from '@/lib/feedback-parse';
import { GradientButton } from '@/components/ui/gradient-button';

export const CARD_SHELL_CLASS =
  'flex flex-col rounded-2xl border border-border bg-surface p-6 shadow-sm';

export type CoachFeedbackCardVariant = 'strength' | 'improvement' | 'suggestion';

function scoreColorClass(score: number): string {
  if (score >= 85) return 'bg-emerald-500';
  if (score >= 70) return 'bg-lime-500';
  if (score >= 55) return 'bg-yellow-500';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

const coachFeedbackDotClass: Record<CoachFeedbackCardVariant, string> = {
  strength: 'bg-score-good',
  improvement: 'bg-score-mid',
  suggestion: 'bg-brand',
};

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
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-text-secondary">
          {title}
        </h4>
        <span className="font-display text-2xl font-bold tabular-nums text-text-primary">
          {dim.score === null ? '—' : dim.score}
        </span>
      </div>
      {dim.score !== null ? (
        <div className="h-2 w-full overflow-hidden rounded-full bg-border">
          <div
            className={`h-full rounded-full transition-all duration-500 ${scoreColorClass(dim.score)}`}
            style={{ width: `${dim.score}%` }}
          />
        </div>
      ) : null}
      <p className="font-body text-sm font-semibold text-text-secondary">
        {dim.label}
      </p>
      {dim.comment ? (
        <p className="font-body text-sm text-text-primary">{dim.comment}</p>
      ) : null}
      {footer ? (
        <div className="border-t border-border pt-3">{footer}</div>
      ) : null}
    </div>
  );
}

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
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${coachFeedbackDotClass[variant]}`}
          aria-hidden
        />
        <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-text-secondary">
          {title}
        </h4>
      </div>
      <p className="font-body text-base leading-relaxed text-text-primary">
        {body}
      </p>
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
  | { kind: 'parse_failed' }
  | { kind: 'raw'; text: string }
  | { kind: 'none' };

const MAX_REGENERATE_ATTEMPTS = 3;

export function parseFeedbackDisplay(raw: string | null): ParsedFeedbackDisplay {
  if (raw == null || raw.trim() === '') return { kind: 'none' };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { kind: 'raw', text: raw };
    }
    if (isFeedbackParseErrorPayload(parsed)) {
      return { kind: 'parse_failed' };
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

export function CoachFeedbackSection({
  feedbackRaw,
  answerId,
}: {
  feedbackRaw: string | null;
  answerId?: string;
}) {
  const [localFeedbackRaw, setLocalFeedbackRaw] = useState(feedbackRaw);
  const [regenerateAttempts, setRegenerateAttempts] = useState(0);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    setLocalFeedbackRaw(feedbackRaw);
  }, [feedbackRaw]);

  const fb = parseFeedbackDisplay(localFeedbackRaw);
  const attemptsRemaining = MAX_REGENERATE_ATTEMPTS - regenerateAttempts;

  async function handleRegenerate() {
    if (!answerId || regenerateAttempts >= MAX_REGENERATE_ATTEMPTS) {
      return;
    }

    setIsRegenerating(true);
    try {
      const res = await fetch(
        `/api/answers/${answerId}/regenerate-feedback`,
        { method: 'POST' },
      );
      const result = (await res.json()) as {
        error?: string;
        feedback?: string;
      };

      if (res.ok && typeof result.feedback === 'string') {
        setLocalFeedbackRaw(result.feedback);
      } else {
        console.error('Regenerate failed:', result.error);
      }
    } catch (err) {
      console.error('Regenerate error:', err);
    } finally {
      setRegenerateAttempts((n) => n + 1);
      setIsRegenerating(false);
    }
  }

  if (fb.kind === 'none') {
    return null;
  }

  if (fb.kind === 'parse_failed') {
    return (
      <section className="space-y-4">
        <h3 className="font-display text-lg font-semibold text-text-primary">
          Coach Feedback
        </h3>
        <div className="space-y-4 rounded-2xl border border-score-bad/30 bg-score-bad/5 p-6">
          <p className="font-body text-sm text-text-primary">
            We couldn&apos;t parse the coach feedback this time. This sometimes
            happens when the model&apos;s response is malformed.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <GradientButton
              size="default"
              onClick={() => void handleRegenerate()}
              disabled={
                !answerId || isRegenerating || attemptsRemaining === 0
              }
            >
              {isRegenerating ? 'Regenerating...' : 'Regenerate Feedback'}
            </GradientButton>
            <p className="font-body text-sm text-text-secondary">
              {attemptsRemaining > 0
                ? `${attemptsRemaining} ${attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining`
                : 'Maximum attempts reached. Refresh to try again later.'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (fb.kind === 'structured') {
    return (
      <section className="space-y-4">
        <h3 className="font-display text-lg font-semibold text-text-primary">
          Coach Feedback
        </h3>
        <div className="space-y-4">
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
    <section className="space-y-4">
      <h3 className="font-display text-lg font-semibold text-text-primary">
        Coach Feedback
      </h3>
      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="whitespace-pre-wrap break-words font-body text-base leading-relaxed text-text-primary">
          {fb.text}
        </p>
      </div>
    </section>
  );
}
