import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase-server';

type AuthResult =
  | { user: User; supabase: SupabaseClient }
  | { error: NextResponse };

export async function requireAuthUser(): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }),
    };
  }

  return { user, supabase };
}
