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

  return NextResponse.json({ text: response.text });
}
