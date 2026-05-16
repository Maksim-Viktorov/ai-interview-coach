import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAuthUser } from '@/lib/auth-api';

const INSUFFICIENT =
  'Question bank insufficient — needs at least 3 questions.';

/**
 * Picks exactly 3 question UUIDs: prefer one random question per category (up to 3
 * categories), then fill from the full bank if needed. Returns null if the bank
 * cannot supply 3 distinct questions.
 */
async function pickThreeQuestionIds(
  supabase: SupabaseClient,
): Promise<string[] | null> {
  const { count, error: countError } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('[sessions] question count:', countError.message);
    return null;
  }
  if (count !== null && count < 3) {
    return null;
  }

  const { data: categoryRows, error: catError } = await supabase
    .from('questions')
    .select('category');

  if (catError) {
    console.error('[sessions] categories:', catError.message);
    return null;
  }

  const distinctCategories = [
    ...new Set(
      (categoryRows ?? [])
        .map((r: { category: string | null }) => r.category)
        .filter((c): c is string => typeof c === 'string' && c.length > 0),
    ),
  ];

  const shuffled = [...distinctCategories].sort(() => Math.random() - 0.5);
  const chosenCategories = shuffled.slice(0, 3);

  const questionIds: string[] = [];
  const used = new Set<string>();

  for (const category of chosenCategories) {
    if (questionIds.length >= 3) break;
    const { data } = await supabase
      .from('questions')
      .select('id')
      .eq('category', category)
      .limit(50);

    const rows = data ?? [];
    const candidates = rows.filter((r) => !used.has(r.id));
    if (candidates.length === 0) continue;
    const random = candidates[Math.floor(Math.random() * candidates.length)]!;
    questionIds.push(random.id);
    used.add(random.id);
  }

  if (questionIds.length < 3) {
    console.warn(
      '[sessions] fewer than 3 questions from category variety; filling from full bank',
    );
    const { data: pool } = await supabase.from('questions').select('id').limit(100);

    const poolIds = [
      ...new Set((pool ?? []).map((r: { id: string }) => r.id)),
    ].filter((id) => !used.has(id));
    const shuffledIds = [...poolIds].sort(() => Math.random() - 0.5);

    for (const id of shuffledIds) {
      if (questionIds.length >= 3) break;
      questionIds.push(id);
      used.add(id);
    }
  }

  if (questionIds.length < 3) {
    return null;
  }

  return questionIds.slice(0, 3);
}

export async function POST() {
  const auth = await requireAuthUser();
  if ('error' in auth) {
    return auth.error;
  }
  const { user, supabase } = auth;

  const questionIds = await pickThreeQuestionIds(supabase);
  if (!questionIds) {
    return NextResponse.json({ error: INSUFFICIENT }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('interview_sessions')
    .insert([
      {
        interview_type: 'behavioral',
        question_ids: questionIds,
        user_id: user.id,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session: data });
}
