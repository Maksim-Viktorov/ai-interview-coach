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

  const wordCount = body.answer.trim().split(/\s+/).length;

  let feedback: string;
  if (wordCount < 30) {
    feedback =
      'Your answer is quite short. Try giving more context, explaining the challenge, your actions, and the final result.';
  } else if (wordCount > 200) {
    feedback =
      'Your answer is detailed, but may be too long for an interview. Try making it more concise and structured.';
  } else {
    feedback =
      'Good answer length. Next, try making sure you clearly explain the situation, your actions, and the result.';
  }

  const { data, error } = await supabaseServer
    .from('interview_answers')
    .insert([
      {
        session_id: body.sessionId,
        question: body.question,
        answer: body.answer,
        feedback,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ answer: data, feedback });
}
