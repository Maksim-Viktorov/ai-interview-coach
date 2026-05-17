import Link from 'next/link';
import { InterviewFlow } from '@/components/interview/interview-flow';
import { AuthHeader } from '@/components/auth/header';
import { gradientButtonClassName } from '@/lib/gradient-button-styles';
import { createSupabaseServerClient } from '@/lib/supabase-server';

type QuestionRow = {
  id: string;
  text: string;
};

type SessionRow = {
  id: string;
  created_at: string;
  interview_type: string;
  status: string;
  question_ids?: string[] | null;
};

function SessionErrorPage({
  title,
  description,
}: {
  title: string;
  description: string;
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
          <Link href="/" className={gradientButtonClassName('large')}>
            Back to Home
          </Link>
        </div>
      </main>
    </>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();

  const { data: session, error } = await supabase
    .from('interview_sessions')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !session) {
    return (
      <SessionErrorPage
        title="Session not found"
        description="We couldn't find this interview session. It may have been deleted or you may not have access."
      />
    );
  }

  const s = session as SessionRow;
  const rawIds = s.question_ids;
  if (!Array.isArray(rawIds) || rawIds.length !== 3) {
    return (
      <SessionErrorPage
        title="Missing question data"
        description="This session doesn't have valid questions assigned."
      />
    );
  }

  const { data: questionRows, error: qErr } = await supabase
    .from('questions')
    .select('id, text')
    .in('id', rawIds);

  if (qErr || !questionRows) {
    return (
      <SessionErrorPage
        title="Missing question data"
        description="This session doesn't have valid questions assigned."
      />
    );
  }

  const rows = questionRows as QuestionRow[];
  const orderedQuestions = rawIds
    .map((qid) => rows.find((q) => q.id === qid))
    .filter((q): q is QuestionRow => q != null);

  if (orderedQuestions.length !== 3) {
    return (
      <SessionErrorPage
        title="Missing question data"
        description="This session doesn't have valid questions assigned."
      />
    );
  }

  const questionTexts = orderedQuestions.map((q) => q.text);
  const questionIdsList = orderedQuestions.map((q) => q.id);

  return (
    <>
      <AuthHeader />
      <main className="flex flex-1 flex-col items-center px-6 pt-12 pb-20">
        <div className="w-full max-w-3xl">
          <InterviewFlow
            sessionId={session.id}
            questions={questionTexts}
            questionIds={questionIdsList}
          />
        </div>
      </main>
    </>
  );
}
