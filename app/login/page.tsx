'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GradientButton } from '@/components/ui/gradient-button';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

type Tab = 'login' | 'signup';

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
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold text-brand">
            AI Interview Coach
          </h1>
        </div>

        <div className="space-y-6 rounded-2xl border border-border bg-surface p-8">
          <div className="flex gap-1 border-b border-border">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setError(null);
              }}
              className={`px-1 pb-3 font-display text-base font-semibold transition-colors ${
                tab === 'login'
                  ? '-mb-px border-b-2 border-brand text-brand'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('signup');
                setError(null);
              }}
              className={`ml-6 px-1 pb-3 font-display text-base font-semibold transition-colors ${
                tab === 'signup'
                  ? '-mb-px border-b-2 border-brand text-brand'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Sign up
            </button>
          </div>

          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="space-y-4"
          >
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block font-body text-sm font-semibold text-text-primary"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 font-body text-base text-text-primary transition placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block font-body text-sm font-semibold text-text-primary"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={
                  tab === 'login' ? 'current-password' : 'new-password'
                }
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 font-body text-base text-text-primary transition placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                placeholder="••••••••"
              />
            </div>

            <GradientButton
              type="submit"
              size="large"
              disabled={submitting}
              className="w-full"
            >
              {submitting
                ? tab === 'login'
                  ? 'Logging in...'
                  : 'Signing up...'
                : tab === 'login'
                  ? 'Log In'
                  : 'Sign Up'}
            </GradientButton>

            {error ? (
              <div
                className="rounded-xl border border-score-bad/30 bg-score-bad/5 px-4 py-3"
                role="alert"
              >
                <p className="font-body text-sm text-score-bad">{error}</p>
              </div>
            ) : null}
          </form>

          <p className="pt-2 text-center font-body text-sm text-text-secondary">
            {tab === 'login' ? (
              <>
                New here?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setTab('signup');
                    setError(null);
                  }}
                  className="font-semibold text-brand hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setTab('login');
                    setError(null);
                  }}
                  className="font-semibold text-brand hover:underline"
                >
                  Log in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </main>
  );
}
