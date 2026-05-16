import Link from 'next/link';
import { InterviewFlow } from '@/components/interview/interview-flow';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { AuthHeader } from '@/components/auth/header';

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
      <main className="p-8 space-y-6">
        <p className="mb-4">Session not found</p>
        <Link
          href="/"
          className="inline-block rounded border border-gray-500 px-4 py-2 text-white hover:bg-gray-800"
        >
          Back to sessions
        </Link>
      </main>
    );
  }

  const s = session as SessionRow;
  const rawIds = s.question_ids;
  if (!Array.isArray(rawIds) || rawIds.length !== 3) {
    return (
      <main className="p-8 space-y-6">
        <p className="mb-4">This session is missing question data</p>
        <Link
          href="/"
          className="inline-block rounded border border-gray-500 px-4 py-2 text-white hover:bg-gray-800"
        >
          Back to home
        </Link>
      </main>
    );
  }

  const { data: questionRows, error: qErr } = await supabase
    .from('questions')
    .select('id, text')
    .in('id', rawIds);

  if (qErr || !questionRows) {
    return (
      <main className="p-8 space-y-6">
        <p className="mb-4">This session is missing question data</p>
        <Link
          href="/"
          className="inline-block rounded border border-gray-500 px-4 py-2 text-white hover:bg-gray-800"
        >
          Back to home
        </Link>
      </main>
    );
  }

  const rows = questionRows as QuestionRow[];
  const orderedQuestions = rawIds
    .map((qid) => rows.find((q) => q.id === qid))
    .filter((q): q is QuestionRow => q != null);

  if (orderedQuestions.length !== 3) {
    return (
      <main className="p-8 space-y-6">
        <p className="mb-4">This session is missing question data</p>
        <Link
          href="/"
          className="inline-block rounded border border-gray-500 px-4 py-2 text-white hover:bg-gray-800"
        >
          Back to home
        </Link>
      </main>
    );
  }

  const questionTexts = orderedQuestions.map((q) => q.text);
  const questionIdsList = orderedQuestions.map((q) => q.id);

  return (
    <>
      <AuthHeader />
      <main className="p-8 space-y-6">
      <h1 className="text-2xl font-bold mb-4">Interview Session</h1>

      <ul className="mb-6 space-y-2">
        <li>
          <span className="font-medium">ID:</span> {session.id}
        </li>
        <li>
          <span className="font-medium">Type:</span> {session.interview_type}
        </li>
        <li>
          <span className="font-medium">Status:</span> {session.status}
        </li>
        <li>
          <span className="font-medium">Created:</span>{' '}
          {new Date(session.created_at).toLocaleString()}
        </li>
      </ul>
      <InterviewFlow
        sessionId={session.id}
        questions={questionTexts}
        questionIds={questionIdsList}
      />

      <Link
        href="/"
        className="inline-block rounded border border-gray-500 px-4 py-2 text-white hover:bg-gray-800"
      >
        Back to sessions
      </Link>
    </main>
    </>
  );
}
