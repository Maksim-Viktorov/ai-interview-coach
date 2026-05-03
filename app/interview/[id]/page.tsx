import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase-server';

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: session, error } = await supabaseServer
    .from('interview_sessions')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !session) {
    return (
      <main className="p-8">
        <p className="mb-4">Session not found</p>
        <Link href="/" className="text-blue-600 underline">
          Back to sessions
        </Link>
      </main>
    );
  }

  return (
    <main className="p-8">
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
      <section className="mt-8 rounded border p-4">
        <h2 className="mb-2 text-xl font-semibold">Question 1</h2>

        <p className="mb-4">
          Tell me about a technical challenge you faced and how you solved it.
        </p>

        <textarea
          className="min-h-32 w-full rounded border p-3"
          placeholder="Type your answer here..."
        />

        <button
          type="button"
          className="mt-4 rounded bg-black px-4 py-2 text-white hover:bg-gray-800"
        >
          Submit Answer
        </button>
      </section>
      <Link href="/" className="text-blue-600 underline">
        Back to sessions
      </Link>
    </main>
  );
}
