'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthHeader } from '@/components/auth/header';
import {
  GradientButton,
  gradientButtonClassName,
} from '@/components/ui/gradient-button';

export default function Home() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleStartInterview = async () => {
    setCreateError(null);
    setIsCreating(true);

    try {
      const res = await fetch('/api/sessions', { method: 'POST' });
      const result = (await res.json()) as {
        session?: { id: string };
        error?: string;
      };

      if (!res.ok) {
        setCreateError(result.error ?? 'Could not start interview');
        return;
      }

      const sessionId = result.session?.id;
      if (!sessionId) {
        setCreateError('Could not start interview');
        return;
      }

      router.push(`/interview/${sessionId}`);
    } catch {
      setCreateError('Could not start interview');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <AuthHeader />
      <main className="flex flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="flex max-w-2xl flex-col items-center">
            <h1 className="text-center font-display text-5xl font-bold text-brand md:text-6xl">
              Welcome to AI Interview Coach
            </h1>
            <p className="mt-4 max-w-xl text-center font-body text-lg text-text-secondary">
              Practice behavioral interviews with delivery analytics
            </p>

            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <GradientButton
                onClick={() => void handleStartInterview()}
                disabled={isCreating}
              >
                {isCreating ? 'Creating session…' : 'Start Interview'}
              </GradientButton>
              <Link href="/stats" className={gradientButtonClassName}>
                View Stats
              </Link>
            </div>

            {createError ? (
              <p className="mt-4 text-center text-sm text-score-bad" role="alert">
                {createError}
              </p>
            ) : null}
          </div>
        </div>
      </main>
    </>
  );
}
