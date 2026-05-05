import { NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { supabaseServer } from '@/lib/supabase-server';

type SpeechMetricsPayload = {
  wordCount: number;
  durationSeconds: number;
  wordsPerMinute: number;
  paceFeedback: string;
  fillerCount: number;
  fillerFeedback: string;
};

type AnswersRequestBody = {
  sessionId?: string;
  question?: string;
  answer?: string;
  speechMetrics?: SpeechMetricsPayload | null;
};

const FEEDBACK_PARSE_FALLBACK = {
  strength: 'Could not parse feedback',
  improvement: '',
  suggestion: '',
};

const OPENAI_FAIL_FALLBACK = {
  strength:
    'Feedback could not be generated, but your answer was saved.',
  improvement: '',
  suggestion: '',
};

type ParsedFeedback = {
  strength: string;
  improvement: string;
  suggestion: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as AnswersRequestBody;

  if (!body.sessionId || !body.question || !body.answer) {
    return NextResponse.json(
      { error: 'sessionId, question, and answer are required' },
      { status: 400 },
    );
  }

  let parsed: ParsedFeedback;

  try {
    const response = await openai.responses.create({
      model: 'gpt-5.4-mini',
      input: `You are an interview coach. Analyze this answer and return JSON in this exact format:

{
  "strength": string,
  "improvement": string,
  "suggestion": string
}

Question:
${body.question}

Answer:
${body.answer}

Keep each field under 50 words.`,
    });

    try {
      parsed = JSON.parse(response.output_text) as ParsedFeedback;
    } catch {
      parsed = FEEDBACK_PARSE_FALLBACK;
    }
  } catch {
    parsed = OPENAI_FAIL_FALLBACK;
  }

  const feedback = JSON.stringify(parsed);

  const { data, error } = await supabaseServer
    .from('interview_answers')
    .insert([
      {
        session_id: body.sessionId,
        question: body.question,
        answer: body.answer,
        feedback,
        speech_metrics: body.speechMetrics ?? null,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ answer: data, feedback: parsed });
}
