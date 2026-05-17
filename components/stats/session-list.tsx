'use client';

import Link from 'next/link';
import type { SessionRow } from '@/lib/stats-aggregation';

type SessionListProps = {
  sessions: SessionRow[];
};

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function statusLine(session: SessionRow): string {
  if (session.isComplete) {
    return `${session.questionCount} questions · Completed`;
  }
  return `${session.answeredCount} of ${session.questionCount} answered · In progress`;
}

export function SessionList({ sessions }: SessionListProps) {
  return (
    <section>
      <h2 className="mb-6 font-display text-lg font-semibold text-text-primary">
        Past Sessions
      </h2>
      <ul className="space-y-3">
        {sessions.map((session) => {
          const href = session.isComplete
            ? `/interview/${session.id}/summary`
            : `/interview/${session.id}`;

          return (
            <li key={session.id}>
              <Link
                href={href}
                className="block rounded-2xl border border-border bg-surface p-5 transition-colors hover:bg-surface-soft"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <p className="font-display text-base font-semibold text-text-primary">
                      {formatSessionDate(session.createdAt)}
                    </p>
                    <p className="font-body text-sm text-text-secondary">
                      {statusLine(session)}
                    </p>
                  </div>
                  <span className="whitespace-nowrap font-display text-sm font-semibold text-brand">
                    {session.isComplete ? 'View →' : 'Resume →'}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
