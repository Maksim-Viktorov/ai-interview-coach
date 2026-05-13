import { NextResponse } from 'next/server';
import { analyzeDeepgramSpeech } from '@/lib/deepgram-analytics';
import {
  normalizeDeepgramResponse,
  transcribeAudioBuffer,
} from '@/lib/deepgram-client';
import { generateCoachFeedback } from '@/lib/deepgram-coach';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const response = await transcribeAudioBuffer(
      buffer,
      file.name,
      file.type,
    );

    const { text, words, utterances } = normalizeDeepgramResponse(response);

    const analytics = analyzeDeepgramSpeech({
      utterances,
      words,
    });

    console.log('[deepgram] analytics summary', {
      pauseCount: analytics.pauseCount,
      longPauseCount: analytics.longPauseCount,
      speechRatio: analytics.speechRatio,
      speakingRateWpm: analytics.speakingRateWpm,
      wpmVariance: analytics.wpmVariance,
      utteranceCount: analytics.utterances.length,
    });

    const coach = generateCoachFeedback(analytics);

    console.log('[deepgram] coach summary', {
      overallScore: coach.overallScore,
      pacing: coach.pacing.label,
      pauses: coach.pauses.label,
      consistency: coach.consistency.label,
    });

    return NextResponse.json({
      text,
      words,
      analytics,
      coach,
    });
  } catch (err) {
    console.error('[deepgram] transcribe failed', err);
    const message =
      err instanceof Error && err.message.includes('DEEPGRAM_API_KEY')
        ? err.message
        : 'Deepgram transcription failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
