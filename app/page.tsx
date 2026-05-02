'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

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
    const { data, error } = await supabase
      .from('interview_sessions')
      .insert([{ interview_type: 'coding' }])
      .select()
      .single();

    if (error) {
      console.error('Error creating session:', error);
      return;
    }

    setSessions((prev) => [data, ...prev]);
  };

  if (loading) return <main className="p-8">Loading...</main>;

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">AI Interview Coach</h1>

      <h2 className="text-xl font-semibold mb-2">Interview Sessions</h2>

      <button
        type="button"
        className="mb-4 rounded bg-black px-4 py-2 text-white hover:bg-gray-800"
        onClick={() => void createSession()}
      >
        Start New Interview
      </button>

      {sessions.length === 0 ? (
        <p>No sessions found.</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((session) => (
            <li key={session.id} className="border rounded p-3">
              <p>Type: {session.interview_type}</p>
              <p>Status: {session.status}</p>
              <p className="text-sm text-gray-500">
                Created: {new Date(session.created_at).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}