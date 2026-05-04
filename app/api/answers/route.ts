import { NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
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

  let feedback: string;
  try {
    const response = await openai.responses.create({
      model: 'gpt-5.4-mini',
      input: `You are an interview coach. Give concise feedback on this behavioral interview answer.

Question:
${body.question}

Answer:
${body.answer}

Feedback should include:
- one strength
- one improvement
- one concrete suggestion

Keep it under 120 words.`,
    });
    feedback = response.output_text;
  } catch {
    feedback =
      'Feedback could not be generated, but your answer was saved.';
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
