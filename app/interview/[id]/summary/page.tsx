import Link from 'next/link';
import { AuthHeader } from '@/components/auth/header';
import { SessionSummary } from '@/components/interview/session-summary';
import { gradientButtonClassName } from '@/components/ui/gradient-button';
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

function SummaryErrorPage({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <>
      <AuthHeader />
      <main className="flex flex-1 flex-col items-center px-6 pt-12 pb-20">
        <div className="w-full max-w-2xl text-center">
          <h1 className="mb-4 font-display text-3xl font-bold text-text-primary">
            {title}
          </h1>
          <p className="mb-8 font-body text-text-secondary">{description}</p>
          <Link href={href} className={gradientButtonClassName('large')}>
            {linkLabel}
          </Link>
        </div>
      </main>
    </>
  );
}

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
      <SummaryErrorPage
        title="Session not found"
        description="We couldn't find this interview session."
        href="/"
        linkLabel="Back to Home"
      />
    );
  }

  const s = session as SessionRow;
  const rawIds = s.question_ids;
  if (!Array.isArray(rawIds) || rawIds.length !== 3) {
    console.error(
      '[summary] invalid question_ids for session',
      id,
      rawIds,
    );
    return (
      <SummaryErrorPage
        title="Session data unavailable"
        description="Something went wrong loading this session. Please try again or start a new interview."
        href="/"
        linkLabel="Back to Home"
      />
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
    console.error(
      '[summary] failed to load questions for session',
      id,
      qErr,
    );
    return (
      <SummaryErrorPage
        title="Session data unavailable"
        description="Something went wrong loading this session. Please try again or start a new interview."
        href="/"
        linkLabel="Back to Home"
      />
    );
  }

  const rows = questionRows as QuestionRow[];
  const orderedQuestions = rawIds
    .map((qid) => rows.find((q) => q.id === qid))
    .filter((q): q is QuestionRow => q != null);

  if (orderedQuestions.length !== 3) {
    console.error(
      '[summary] question count mismatch for session',
      id,
      { expected: 3, got: orderedQuestions.length, rawIds },
    );
    return (
      <SummaryErrorPage
        title="Session data unavailable"
        description="Something went wrong loading this session. Please try again or start a new interview."
        href="/"
        linkLabel="Back to Home"
      />
    );
  }

  const pairs = buildSessionSummaryPairs(orderedQuestions, answers);

  if (!pairs) {
    return (
      <SummaryErrorPage
        title="Session in progress"
        description="This interview session hasn't been completed yet."
        href={`/interview/${id}`}
        linkLabel="Continue Interview"
      />
    );
  }

  return (
    <>
      <AuthHeader />
      <main className="flex flex-1 flex-col items-center px-6 pt-12 pb-20">
        <div className="w-full max-w-3xl">
          <SessionSummary
            sessionCreatedAt={s.created_at}
            pairs={pairs}
          />
        </div>
      </main>
    </>
  );
}
