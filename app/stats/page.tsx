import Link from 'next/link';
import { AuthHeader } from '@/components/auth/header';
import { SessionList } from '@/components/stats/session-list';
import { StatsOverview } from '@/components/stats/stats-overview';
import {
  computeAggregates,
  deriveSessionRows,
  type AnswerDbRow,
  type SessionDbRow,
} from '@/lib/stats-aggregation';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export default async function StatsPage() {
  const supabase = await createSupabaseServerClient();

  const [
    { data: sessions, error: sessionsError },
    { data: answers, error: answersError },
  ] = await Promise.all([
    supabase
      .from('interview_sessions')
      .select('id, created_at, question_ids, interview_type')
      .order('created_at', { ascending: false }),
    supabase
      .from('interview_answers')
      .select(
        'id, session_id, question_id, delivery_scorecard, gaze_metrics, created_at',
      )
      .order('created_at', { ascending: false }),
  ]);

  if (sessionsError || answersError) {
    return (
      <>
        <AuthHeader />
        <main className="mx-auto max-w-5xl space-y-4 p-8">
          <p className="text-red-600" role="alert">
            Could not load your stats. Please try again.
          </p>
          <Link
            href="/"
            className="inline-block rounded border border-gray-500 px-4 py-2 text-white hover:bg-gray-800"
          >
            Back to home
          </Link>
        </main>
      </>
    );
  }

  const sessionRows = (sessions ?? []) as SessionDbRow[];
  const answerRows = (answers ?? []) as AnswerDbRow[];
  const aggregates = computeAggregates(sessionRows, answerRows);
  const derivedSessions = deriveSessionRows(sessionRows, answerRows);

  if (aggregates.sessionCount === 0) {
    return (
      <>
        <AuthHeader />
        <main className="mx-auto max-w-5xl p-8">
          <div className="space-y-4 py-16 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">
              No sessions yet
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Practice an interview to start seeing your stats.
            </p>
            <Link
              href="/"
              className="inline-block rounded bg-white px-4 py-2 text-black hover:bg-gray-200 dark:bg-gray-200"
            >
              Start an Interview
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AuthHeader />
      <main className="mx-auto max-w-5xl space-y-8 p-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">
            Practice Stats
          </h1>
        </header>

        <StatsOverview aggregates={aggregates} />
        <SessionList sessions={derivedSessions} />
      </main>
    </>
  );
}
