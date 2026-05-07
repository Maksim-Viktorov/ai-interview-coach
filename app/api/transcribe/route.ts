import { NextResponse } from 'next/server';
import { openai } from '@/lib/openai';

const FILLER_PHRASES = [
  'um',
  'uh',
  'like',
  'you know',
  'actually',
  'basically',
] as const;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countFillerOccurrences(input: string): number {
  const lower = input.toLowerCase();
  let total = 0;

  for (const phrase of FILLER_PHRASES) {
    const pattern = phrase
      .split(/\s+/)
      .map(escapeRegExp)
      .join('\\s+');
    const re = new RegExp(`\\b${pattern}\\b`, 'gi');
    const matches = lower.match(re);
    if (matches) {
      total += matches.length;
    }
  }

  return total;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const response = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'en',
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
    prompt:
      'The speaker is answering a software engineering behavioral interview question in English. Transcribe strictly in English. Preserve filler words such as um, uh, like, basically, actually, and you know.',
  });
  
  console.log(JSON.stringify(response, null, 2))
  const text = response.text;

  const wordTimings =
    response.words?.flatMap((w) => {
      if (
        typeof w.word !== 'string' ||
        !Number.isFinite(w.start) ||
        !Number.isFinite(w.end)
      ) {
        return [];
      }
      return [{ word: w.word, start: w.start, end: w.end }];
    }) ?? [];

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  const durationSecondsRaw = formData.get('durationSeconds');
  const providedDurationSeconds =
    typeof durationSecondsRaw === 'string'
      ? Number(durationSecondsRaw)
      : null;

  const durationSeconds =
    providedDurationSeconds &&
    Number.isFinite(providedDurationSeconds)
      ? providedDurationSeconds
      : file.size / 16000;

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

  const fillerCount = countFillerOccurrences(text);

  let fillerFeedback: string;
  if (fillerCount === 0) {
    fillerFeedback = 'No obvious filler words detected.';
  } else if (fillerCount <= 3) {
    fillerFeedback =
      'A few filler words detected. Try pausing silently instead.';
  } else {
    fillerFeedback =
      'Several filler words detected. Practice replacing fillers with short pauses.';
  }

  return NextResponse.json({
    text,
    metrics: {
      wordCount,
      durationSeconds,
      wordsPerMinute,
      paceFeedback,
      fillerCount,
      fillerFeedback,
    },
    wordTimings,
  });
}
