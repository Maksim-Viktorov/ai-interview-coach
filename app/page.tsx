'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AuthHeader } from '@/components/auth/header';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

type InterviewSession = {
  id: string;
  created_at: string;
  interview_type: string;
  status: string;
};

export default function Home() {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSessions = async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('interview_sessions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching sessions:', error);
      } else {
        setSessions(data ?? []);
      }

      setLoading(false);
    };

    fetchSessions();
  }, []);

  const createSession = async () => {
    const res = await fetch('/api/sessions', { method: 'POST' });
    const result = (await res.json()) as {
      session?: InterviewSession;
      error?: string;
    };

    if (!res.ok) {
      console.error('Error creating session:', result.error);
      return;
    }

    const session = result.session;
    if (session) {
      setSessions((prev) => [session, ...prev]);
    }
  };

  if (loading) return <main className="p-8 space-y-6">Loading...</main>;

  return (
    <>
      <AuthHeader />
      <main className="p-8 space-y-6">
      <h1 className="text-2xl font-bold mb-4">AI Interview Coach</h1>

      <h2 className="text-xl font-semibold mb-2">Interview Sessions</h2>

      <div className="mb-4 flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded bg-white px-4 py-2 text-black hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void createSession()}
        >
          Start New Interview
        </button>
        <Link
          href="/stats"
          className="rounded bg-white px-4 py-2 text-black hover:bg-gray-200"
        >
          View Stats
        </Link>
      </div>

      {sessions.length === 0 ? (
        <p>No sessions found.</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((session) => (
            <li key={session.id}>
              <Link
                href={`/interview/${session.id}`}
                className="block border rounded p-3 hover:bg-gray-50 cursor-pointer"
              >
                <p>Type: {session.interview_type}</p>
                <p>Status: {session.status}</p>
                <p className="text-sm text-gray-500">
                  Created: {new Date(session.created_at).toLocaleString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
    </>
  );
}