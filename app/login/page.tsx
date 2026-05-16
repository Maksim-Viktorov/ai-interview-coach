'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

type Tab = 'login' | 'signup';

const cardClass =
  'w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-600 dark:bg-gray-950/40';

const inputClass =
  'min-h-11 w-full rounded border border-gray-300 bg-white p-3 text-gray-950 placeholder:text-gray-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createSupabaseBrowserClient();

    try {
      if (tab === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError(signInError.message);
          return;
        }
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }
      }

      router.push('/');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center p-8">
      <div className={cardClass}>
        <h1 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-white">
          Welcome
        </h1>

        <div className="mt-6 flex border-b border-gray-200 dark:border-gray-600">
          <button
            type="button"
            className={`flex-1 pb-2 text-sm font-medium ${
              tab === 'login'
                ? 'border-b-2 border-gray-950 text-gray-950 dark:border-white dark:text-white'
                : 'text-gray-500 dark:text-gray-400'
            }`}
            onClick={() => {
              setTab('login');
              setError(null);
            }}
          >
            Log in
          </button>
          <button
            type="button"
            className={`flex-1 pb-2 text-sm font-medium ${
              tab === 'signup'
                ? 'border-b-2 border-gray-950 text-gray-950 dark:border-white dark:text-white'
                : 'text-gray-500 dark:text-gray-400'
            }`}
            onClick={() => {
              setTab('signup');
              setError(null);
            }}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={
                tab === 'login' ? 'current-password' : 'new-password'
              }
              required
              minLength={6}
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100"
          >
            {submitting
              ? 'Please wait…'
              : tab === 'login'
                ? 'Log in'
                : 'Sign up'}
          </button>

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}
        </form>

        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          {tab === 'login' ? (
            <>
              New here?{' '}
              <button
                type="button"
                className="font-medium text-gray-900 underline underline-offset-2 dark:text-gray-100"
                onClick={() => {
                  setTab('signup');
                  setError(null);
                }}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="font-medium text-gray-900 underline underline-offset-2 dark:text-gray-100"
                onClick={() => {
                  setTab('login');
                  setError(null);
                }}
              >
                Log in
              </button>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
