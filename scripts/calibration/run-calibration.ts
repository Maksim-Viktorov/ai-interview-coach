/**
 * Calibration batch runner — sends local audio through the same Deepgram + analytics
 * path as production so metrics match the live app.
 *
 * Usage:
 * 1. Put audio files in `scripts/calibration/recordings/` (supported: .mp3, .mp4, .wav,
 *    .m4a, .webm, .ogg).
 * 2. Optional filename prefixes for grouping in analysis: `good_`, `weak_`, `mediocre_`
 *    (e.g. `good_answer1.webm`).
 * 3. From the project root: `npm run calibrate`
 * 4. Output: `scripts/calibration/results.json` (pretty-printed).
 *
 * Cost: each file uses Deepgram prerecorded API credits (order of ~$0.005/min of audio;
 *    check current Deepgram pricing).
 *
 * Analytics: calls `analyzeDeepgramSpeech` from `lib/deepgram-analytics.ts` with the same
 * `{ utterances, words }` as production (via `lib/deepgram-client.ts`).
 */

import { config as loadEnv } from 'dotenv';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { basename, extname, join } from 'path';
import { analyzeDeepgramSpeech, type DeepgramAnalytics } from '@/lib/deepgram-analytics';
import {
  normalizeDeepgramResponse,
  transcribeAudioBuffer,
} from '@/lib/deepgram-client';

loadEnv({ path: join(process.cwd(), '.env.local') });

const ALLOWED_EXT = new Set([
  '.mp3',
  '.mp4',
  '.wav',
  '.m4a',
  '.webm',
  '.ogg',
]);

const RECORDINGS_DIR = join(process.cwd(), 'scripts/calibration/recordings');
const RESULTS_PATH = join(process.cwd(), 'scripts/calibration/results.json');

type QualityLabel = 'good' | 'weak' | 'mediocre' | 'unlabeled';

function qualityFromFilename(name: string): QualityLabel {
  const lower = name.toLowerCase();
  if (lower.startsWith('good_')) return 'good';
  if (lower.startsWith('weak_')) return 'weak';
  if (lower.startsWith('mediocre_')) return 'mediocre';
  return 'unlabeled';
}

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.mp3':
      return 'audio/mpeg';
    case '.mp4':
      return 'audio/mp4';
    case '.wav':
      return 'audio/wav';
    case '.m4a':
      return 'audio/mp4';
    case '.webm':
      return 'audio/webm';
    case '.ogg':
      return 'audio/ogg';
    default:
      return 'application/octet-stream';
  }
}

type CalibrationRecord =
  | ({
      file: string;
      quality: QualityLabel;
      durationSeconds: number;
    } & DeepgramAnalytics)
  | { file: string; quality: QualityLabel; error: string };

async function main() {
  mkdirSync(RECORDINGS_DIR, { recursive: true });

  let entries: string[];
  try {
    entries = readdirSync(RECORDINGS_DIR);
  } catch {
    console.error(`Could not read ${RECORDINGS_DIR}`);
    process.exit(1);
  }

  const files = entries.filter((name) => {
    const ext = extname(name).toLowerCase();
    return ALLOWED_EXT.has(ext);
  });

  const results: CalibrationRecord[] = [];
  const qualityCounts: Record<QualityLabel, number> = {
    good: 0,
    weak: 0,
    mediocre: 0,
    unlabeled: 0,
  };
  let failures = 0;

  const n = files.length;
  for (let i = 0; i < n; i++) {
    const file = files[i]!;
    const filePath = join(RECORDINGS_DIR, file);
    const quality = qualityFromFilename(file);
    console.log(`Processing ${i + 1} of ${n}: ${file}`);

    try {
      const buffer = readFileSync(filePath);
      const ext = extname(file).toLowerCase();
      const contentType = mimeFromExt(ext);
      const response = await transcribeAudioBuffer(
        buffer,
        basename(file),
        contentType,
      );
      const { words, utterances } = normalizeDeepgramResponse(response);
      const analytics = analyzeDeepgramSpeech({ utterances, words });

      qualityCounts[quality] += 1;

      results.push({
        file,
        quality,
        durationSeconds: analytics.activeAnswerDurationSeconds,
        ...analytics,
      });
    } catch (err) {
      failures += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR ${file}: ${message}`);
      results.push({ file, quality, error: message });
    }
  }

  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2), 'utf8');

  const ok = n - failures;
  console.log('\n--- Summary ---');
  console.log(`Total files: ${n}`);
  console.log(`Succeeded: ${ok}`);
  console.log(`Failed: ${failures}`);
  console.log(`By quality: good=${qualityCounts.good} weak=${qualityCounts.weak} mediocre=${qualityCounts.mediocre} unlabeled=${qualityCounts.unlabeled}`);
  console.log(`Wrote ${RESULTS_PATH}`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
