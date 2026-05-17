'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { OutlineButton } from '@/components/ui/outline-button';
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
    <header className="sticky top-0 z-10 w-full border-b border-border bg-surface">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link
          href="/"
          className="font-display text-xl font-bold text-brand transition-opacity hover:opacity-80"
        >
          AI Interview Coach
        </Link>
        <div className="flex items-center gap-4">
          {email ? (
            <span
              className="hidden max-w-xs truncate font-body text-sm text-text-secondary sm:inline"
              title={email}
            >
              {email}
            </span>
          ) : null}
          <OutlineButton onClick={() => void handleLogout()}>
            Log out
          </OutlineButton>
        </div>
      </div>
    </header>
  );
}
