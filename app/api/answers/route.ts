import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

type AnswersRequestBody = {
  sessionId?: string;
  question?: string;
  answer?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as AnswersRequestBody;

  if (!body.sessionId || !body.question || !body.answer) {
    return NextResponse.json(
      { error: 'sessionId, question, and answer are required' },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseServer
    .from('interview_answers')
    .insert([
      {
        session_id: body.sessionId,
        question: body.question,
        answer: body.answer,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ answer: data });
}
