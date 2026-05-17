import Link from 'next/link';
import { AuthHeader } from '@/components/auth/header';
import { SessionList } from '@/components/stats/session-list';
import { StatsOverview } from '@/components/stats/stats-overview';
import { gradientButtonClassName } from '@/lib/gradient-button-styles';
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
    console.error('[stats] failed to load data', sessionsError, answersError);
    return (
      <>
        <AuthHeader />
        <main className="flex flex-1 flex-col items-center px-6 pt-12 pb-20">
          <div className="w-full max-w-2xl text-center">
            <h1 className="mb-4 font-display text-3xl font-bold text-text-primary">
              Could not load stats
            </h1>
            <p className="mb-8 font-body text-text-secondary">
              Something went wrong loading your stats. Please try again.
            </p>
            <Link href="/" className={gradientButtonClassName('large')}>
              Back to Home
            </Link>
          </div>
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
        <main className="flex flex-1 flex-col items-center px-6 pt-12 pb-20">
          <div className="w-full max-w-3xl">
            <div className="space-y-6 py-16 text-center">
              <div className="space-y-3">
                <h1 className="font-display text-4xl font-bold text-text-primary">
                  No sessions yet
                </h1>
                <p className="mx-auto max-w-md font-body text-base text-text-secondary">
                  Practice an interview to start seeing your stats and trends.
                </p>
              </div>
              <Link href="/" className={gradientButtonClassName('large')}>
                Start an Interview
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AuthHeader />
      <main className="flex flex-1 flex-col items-center px-6 pt-12 pb-20">
        <div className="w-full max-w-3xl">
          <div className="mb-12 text-center">
            <h1 className="mb-3 bg-gradient-to-r from-brand-gradient-start to-brand-gradient-end bg-clip-text font-display text-4xl font-bold text-transparent md:text-5xl">
              Your Stats
            </h1>
            <p className="font-body text-base text-text-secondary">
              Practice history and delivery trends
            </p>
          </div>

          <StatsOverview aggregates={aggregates} />
          <SessionList sessions={derivedSessions} />
        </div>
      </main>
    </>
  );
}
