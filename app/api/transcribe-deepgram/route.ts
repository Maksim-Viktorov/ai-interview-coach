import { NextResponse } from 'next/server';
import { DeepgramClient } from '@deepgram/sdk';
import {
  analyzeDeepgramSpeech,
  type DeepgramUtterance,
  type DeepgramWord,
} from '@/lib/deepgram-analytics';
import { generateCoachFeedback } from '@/lib/deepgram-coach';

type WordTiming = DeepgramWord;

function toUtterances(raw: unknown): DeepgramUtterance[] {
  const list = (raw as { results?: { utterances?: unknown } })?.results
    ?.utterances;
  if (!Array.isArray(list)) return [];
  const out: DeepgramUtterance[] = [];
  for (const u of list) {
    if (u == null || typeof u !== 'object') continue;
    const o = u as Record<string, unknown>;
    const start = o.start;
    const end = o.end;
    if (typeof start !== 'number' || !Number.isFinite(start)) continue;
    if (typeof end !== 'number' || !Number.isFinite(end)) continue;
    if (start > end) continue;
    const transcript =
      typeof o.transcript === 'string' ? o.transcript : undefined;
    out.push({ start, end, transcript });
  }
  return out;
}

function toWordTimings(raw: unknown): WordTiming[] {
  const words =
    (raw as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{
            words?: Array<{ word?: unknown; start?: unknown; end?: unknown }>;
          }>;
        }>;
      };
    })?.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];

  if (!Array.isArray(words)) return [];

  const out: WordTiming[] = [];
  for (const w of words) {
    const word = (w as { word?: unknown }).word;
    const start = (w as { start?: unknown }).start;
    const end = (w as { end?: unknown }).end;
    if (typeof word !== 'string') continue;
    if (typeof start !== 'number' || !Number.isFinite(start)) continue;
    if (typeof end !== 'number' || !Number.isFinite(end)) continue;
    out.push({ word, start, end });
  }
  return out;
}

function toTranscriptText(raw: unknown): string {
  const transcript =
    (raw as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{ transcript?: unknown }>;
        }>;
      };
    })?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';

  return typeof transcript === 'string' ? transcript : '';
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'DEEPGRAM_API_KEY is not configured' },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const deepgram = new DeepgramClient({ apiKey });
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const response = await deepgram.listen.v1.media.transcribeFile(
      { data: buffer, filename: file.name, contentType: file.type },
      {
        model: 'nova-3',
        language: 'en',
        smart_format: true,
        punctuate: true,
        filler_words: true,
        utterances: true,
        utt_split: 0.8,
      },
    );

    const text = toTranscriptText(response);
    const words = toWordTimings(response);
    const utterances = toUtterances(response);

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

    
    // TEMP: debug Deepgram pause/segment metadata in server terminal
    //console.log(JSON.stringify(response, null, 2));

    const results = (response as { results?: Record<string, unknown> })?.results;

    const channels = (results as { channels?: unknown } | undefined)?.channels;
    //console.log(
    //  '[deepgram] results.channels\n',
    //  JSON.stringify(channels ?? null, null, 2),
    //);

    const primaryAlt = (
      (response as { results?: { channels?: unknown[] } })?.results
        ?.channels?.[0] as { alternatives?: unknown[] } | undefined
    )?.alternatives?.[0];
    //console.log(
    //  '[deepgram] alternatives[0] (channels[0])\n',
    //  JSON.stringify(primaryAlt ?? null, null, 2),
    //);

    const utterancesRaw = (results as { utterances?: unknown } | undefined)
      ?.utterances;
    if (utterancesRaw !== undefined && utterancesRaw !== null) {
      //console.log('[deepgram] utterances\n', JSON.stringify(utterancesRaw, null, 2));
    } else {
      //console.log('[deepgram] utterances: <none>');
    }

    const meta = (
      response as { metadata?: Record<string, unknown> }
    )?.metadata;
    //console.log('[deepgram] metadata\n', JSON.stringify(meta ?? null, null, 2));

    //console.log('[deepgram] words.slice(0, 10)', words.slice(0, 10));

    return NextResponse.json({
      text,
      words,
      analytics,
      coach,
    });
  } catch (err) {
    console.error('[deepgram] transcribe failed', err);
    return NextResponse.json(
      { error: 'Deepgram transcription failed' },
      { status: 500 },
    );
  }
}

