'use client';

import Link from 'next/link';
import { CARD_SHELL_CLASS } from '@/components/interview/coach-ui';
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
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-950 dark:text-white">
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
                className={`${CARD_SHELL_CLASS} block transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/60`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-950 dark:text-white">
                      {formatSessionDate(session.createdAt)}
                    </p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {statusLine(session)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-gray-700 dark:text-gray-300">
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
