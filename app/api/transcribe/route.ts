import { NextResponse } from 'next/server';
import { openai } from '@/lib/openai';

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const response = await openai.audio.transcriptions.create({
    file,
    model: 'gpt-4o-mini-transcribe',
  });

  const text = response.text;

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  const durationSeconds = file.size / 16000;

  const wordsPerMinute =
    durationSeconds > 0
      ? Math.round((wordCount / durationSeconds) * 60)
      : 0;

  let paceFeedback: string;
  if (wordsPerMinute < 90) {
    paceFeedback = 'You are speaking quite slowly.';
  } else if (wordsPerMinute > 160) {
    paceFeedback = 'You are speaking quite fast.';
  } else {
    paceFeedback = 'Your speaking pace is good.';
  }

  return NextResponse.json({
    text,
    metrics: {
      wordCount,
      durationSeconds,
      wordsPerMinute,
      paceFeedback,
    },
  });
}
