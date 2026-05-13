import { DeepgramClient } from '@deepgram/sdk';
import type { DeepgramUtterance, DeepgramWord } from '@/lib/deepgram-analytics';

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

function toWordTimings(raw: unknown): DeepgramWord[] {
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

  const out: DeepgramWord[] = [];
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

/**
 * Raw Deepgram SDK response from `transcribeAudioBuffer` (opaque object shape).
 */
export type DeepgramTranscribeResponse = unknown;

/**
 * Runs the same Deepgram prerecorded transcription as production (`/api/transcribe-deepgram`).
 */
export async function transcribeAudioBuffer(
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<DeepgramTranscribeResponse> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY is not configured');
  }

  const deepgram = new DeepgramClient({ apiKey });

  const response = await deepgram.listen.v1.media.transcribeFile(
    { data: buffer, filename, contentType },
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

  return response;
}

/**
 * Normalizes a Deepgram SDK response into transcript + timings for `analyzeDeepgramSpeech`.
 */
export function normalizeDeepgramResponse(response: DeepgramTranscribeResponse): {
  text: string;
  words: DeepgramWord[];
  utterances: DeepgramUtterance[];
} {
  return {
    text: toTranscriptText(response),
    words: toWordTimings(response),
    utterances: toUtterances(response),
  };
}
