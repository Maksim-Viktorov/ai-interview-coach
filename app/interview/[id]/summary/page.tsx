import Link from 'next/link';
import { AuthHeader } from '@/components/auth/header';
import { SessionSummary } from '@/components/interview/session-summary';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  buildSessionSummaryPairs,
  type AnswerDbRow,
  type QuestionRow,
} from '@/lib/session-summary';

type SessionRow = {
  id: string;
  created_at: string;
  question_ids?: string[] | null;
};

export default async function SessionSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: session, error } = await supabase
    .from('interview_sessions')
    .select('id, created_at, question_ids')
    .eq('id', id)
    .single();

  if (error || !session) {
    return (
      <>
        <AuthHeader />
        <main className="p-8 space-y-4">
          <p>Session not found</p>
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

  const s = session as SessionRow;
  const rawIds = s.question_ids;
  if (!Array.isArray(rawIds) || rawIds.length !== 3) {
    return (
      <>
        <AuthHeader />
        <main className="p-8 space-y-4">
          <p>This session is missing question data</p>
          <Link href="/" className="underline">
            Back to home
          </Link>
        </main>
      </>
    );
  }

  const { data: answersData } = await supabase
    .from('interview_answers')
    .select(
      'id, question, question_id, answer, feedback, speech_metrics, delivery_scorecard, delivery_analytics, gaze_metrics, created_at',
    )
    .eq('session_id', id)
    .order('created_at', { ascending: true });

  const answers = (answersData ?? []) as AnswerDbRow[];

  const { data: questionRows, error: qErr } = await supabase
    .from('questions')
    .select('id, text')
    .in('id', rawIds);

  if (qErr || !questionRows) {
    return (
      <>
        <AuthHeader />
        <main className="p-8 space-y-4">
          <p>This session is missing question data</p>
          <Link href="/" className="underline">
            Back to home
          </Link>
        </main>
      </>
    );
  }

  const rows = questionRows as QuestionRow[];
  const orderedQuestions = rawIds
    .map((qid) => rows.find((q) => q.id === qid))
    .filter((q): q is QuestionRow => q != null);

  if (orderedQuestions.length !== 3) {
    return (
      <>
        <AuthHeader />
        <main className="p-8 space-y-4">
          <p>This session is missing question data</p>
          <Link href="/" className="underline">
            Back to home
          </Link>
        </main>
      </>
    );
  }

  const pairs = buildSessionSummaryPairs(orderedQuestions, answers);

  if (!pairs) {
    return (
      <>
        <AuthHeader />
        <main className="p-8 space-y-4">
          <p>This session isn&apos;t complete yet</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Finish all three questions before viewing the session summary.
          </p>
          <Link
            href={`/interview/${id}`}
            className="inline-block rounded border border-gray-500 px-4 py-2 text-white hover:bg-gray-800"
          >
            Continue interview
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <AuthHeader />
      <main className="mx-auto max-w-5xl p-8">
        <SessionSummary
          sessionCreatedAt={s.created_at}
          pairs={pairs}
        />
      </main>
    </>
  );
}
