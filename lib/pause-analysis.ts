const WINDOW_SECONDS = 0.02;
const SILENCE_RMS_THRESHOLD = 0.015;
const MIN_PAUSE_SECONDS = 0.5;

export type PauseMetrics = {
  pauseCount: number;
  totalPauseSeconds: number;
  longestPauseSeconds: number;
  pauseFeedback: string;
};

function rms(samples: Float32Array, start: number, length: number): number {
  if (length <= 0) return 0;
  const end = Math.min(start + length, samples.length);
  const n = end - start;
  if (n <= 0) return 0;
  let sumSq = 0;
  for (let i = start; i < end; i++) {
    const x = samples[i];
    sumSq += x * x;
  }
  return Math.sqrt(sumSq / n);
}

function pauseFeedbackForCount(pauseCount: number): string {
  if (pauseCount === 0) {
    return 'No major pauses detected.';
  }
  if (pauseCount <= 2) {
    return 'A few pauses detected. This can sound natural if used intentionally.';
  }
  return 'Several pauses detected. Try structuring your answer before speaking.';
}

/**
 * Analyzes mono PCM samples for silence segments (pauses).
 * Each window is 20 ms; RMS below 0.015 counts as silent.
 */
export function analyzePausesFromSamples(
  samples: Float32Array,
  sampleRate: number,
): PauseMetrics {
  if (samples.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return {
      pauseCount: 0,
      totalPauseSeconds: 0,
      longestPauseSeconds: 0,
      pauseFeedback: pauseFeedbackForCount(0),
    };
  }

  const windowSamples = Math.max(1, Math.round(sampleRate * WINDOW_SECONDS));

  const silentPerWindow: boolean[] = [];
  for (let start = 0; start < samples.length; start += windowSamples) {
    const len = Math.min(windowSamples, samples.length - start);
    silentPerWindow.push(rms(samples, start, len) < SILENCE_RMS_THRESHOLD);
  }

  const pauseDurationsSec: number[] = [];
  let wi = 0;
  while (wi < silentPerWindow.length) {
    if (!silentPerWindow[wi]) {
      wi++;
      continue;
    }
    let wj = wi;
    while (wj < silentPerWindow.length && silentPerWindow[wj]) {
      wj++;
    }
    const startSample = wi * windowSamples;
    const endSample = Math.min(wj * windowSamples, samples.length);
    const durationSec = (endSample - startSample) / sampleRate;
    if (durationSec >= MIN_PAUSE_SECONDS) {
      pauseDurationsSec.push(durationSec);
    }
    wi = wj;
  }

  const pauseCount = pauseDurationsSec.length;
  const totalPauseSeconds = pauseDurationsSec.reduce((a, b) => a + b, 0);
  const longestPauseSeconds =
    pauseCount > 0 ? Math.max(...pauseDurationsSec) : 0;

  return {
    pauseCount,
    totalPauseSeconds,
    longestPauseSeconds,
    pauseFeedback: pauseFeedbackForCount(pauseCount),
  };
}
