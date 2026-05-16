'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export function AuthHeader() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null);
    });
  }, []);

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="border-b border-gray-200 bg-white/80 px-4 py-3 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-950/80">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-gray-950 dark:text-white"
        >
          AI Interview Coach
        </Link>
        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
          {email ? (
            <span className="max-w-[200px] truncate tabular-nums" title={email}>
              {email}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="font-medium text-gray-900 underline underline-offset-2 hover:text-gray-600 dark:text-gray-100 dark:hover:text-gray-300"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
