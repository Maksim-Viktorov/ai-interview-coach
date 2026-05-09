'use client';

import { useEffect, useRef, useState } from 'react';
import { HighlightedTranscript } from '@/components/interview/highlighted-transcript';
import {
  analyzePausesFromSamples,
  type PauseMetrics,
} from '@/lib/pause-analysis';
import type { DeepgramAnalytics } from '@/lib/deepgram-analytics';
import type { DeepgramCoachFeedback } from '@/lib/deepgram-coach';

function pacingTrendInterpretation(slope: number | null): string | null {
  if (slope === null || typeof slope !== 'number' || !Number.isFinite(slope)) {
    return null;
  }
  if (slope > 0.75) return 'Speeding up over time';
  if (slope < -0.75) return 'Slowing down over time';
  return 'Stable pacing trend';
}

function formatConsistencyNumber(value: number | null): string {
  if (value === null || typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Not enough data';
  }
  return value.toFixed(2);
}

const CHIP_POSITIVE =
  'border-emerald-500/55 bg-emerald-500/15 text-emerald-950 dark:border-emerald-400/45 dark:bg-emerald-500/20 dark:text-emerald-50';
const CHIP_CAUTION =
  'border-amber-500/55 bg-amber-500/15 text-amber-950 dark:border-amber-400/45 dark:bg-amber-500/18 dark:text-amber-50';
const CHIP_ATTENTION =
  'border-orange-500/55 bg-orange-500/15 text-orange-950 dark:border-orange-400/45 dark:bg-orange-500/18 dark:text-orange-50';

function pacingChip(
  label: DeepgramCoachFeedback['pacing']['label'],
): { title: string; chipClass: string } {
  switch (label) {
    case 'good':
      return { title: 'Good pacing', chipClass: CHIP_POSITIVE };
    case 'too_slow':
      return { title: 'Slow pacing', chipClass: CHIP_CAUTION };
    case 'too_fast':
      return { title: 'Fast pacing', chipClass: CHIP_CAUTION };
    default:
      return { title: String(label), chipClass: CHIP_CAUTION };
  }
}

function pausesChip(
  label: DeepgramCoachFeedback['pauses']['label'],
): { title: string; chipClass: string } {
  switch (label) {
    case 'no_pauses':
      return { title: 'No measured pauses', chipClass: CHIP_POSITIVE };
    case 'light':
      return { title: 'Light pauses', chipClass: CHIP_POSITIVE };
    case 'moderate':
      return { title: 'Moderate pauses', chipClass: CHIP_CAUTION };
    case 'heavy':
      return { title: 'Heavy pauses', chipClass: CHIP_ATTENTION };
    case 'very_heavy':
      return { title: 'Very heavy pauses', chipClass: CHIP_ATTENTION };
    default:
      return { title: String(label), chipClass: CHIP_CAUTION };
  }
}

function consistencyChip(
  label: DeepgramCoachFeedback['consistency']['label'],
): { title: string; chipClass: string } {
  switch (label) {
    case 'stable':
      return { title: 'Stable consistency', chipClass: CHIP_POSITIVE };
    case 'moderate':
      return { title: 'Moderate consistency', chipClass: CHIP_CAUTION };
    case 'unstable':
      return { title: 'Unstable consistency', chipClass: CHIP_ATTENTION };
    default:
      return { title: String(label), chipClass: CHIP_CAUTION };
  }
}

type AnswerFormProps = {
  sessionId: string;
  question: string;
  questionNumber: number;
  onSubmitted?: () => void;
};

type FeedbackState = {
  strength: string;
  improvement: string;
  suggestion: string;
};

type TranscribeMetrics = {
  wordCount: number;
  durationSeconds: number;
  wordsPerMinute: number;
  paceFeedback: string;
  fillerCount: number;
  fillerFeedback: string;
};

/** Transcription row plus pauses, or pause-only before transcription finishes. */
type MetricsState =
  | (TranscribeMetrics & Partial<PauseMetrics>)
  | PauseMetrics;

export function AnswerForm({
  sessionId,
  question,
  questionNumber,
  onSubmitted,
}: AnswerFormProps) {
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(
    null,
  );
  const [metrics, setMetrics] = useState<MetricsState | null>(null);
  const [pauseMetrics, setPauseMetrics] = useState<PauseMetrics | null>(null);
  const [audioDurationSeconds, setAudioDurationSeconds] = useState<
    number | null
  >(null);
  const [transcriptEditing, setTranscriptEditing] = useState(false);
  const [analytics, setAnalytics] = useState<DeepgramAnalytics | null>(null);
  const [coach, setCoach] = useState<DeepgramCoachFeedback | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioUrlRef = useRef<string | null>(null);
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const hadFeedbackRef = useRef(false);
  /** Latest pause analysis; merged into `metrics` after transcription completes. */
  const pauseMetricsRef = useRef<PauseMetrics | null>(null);

  const mergePauseIntoMetrics = (
    base: TranscribeMetrics | null,
  ): MetricsState | null => {
    const pause = pauseMetricsRef.current;
    if (!base && !pause) return null;
    if (!base) return { ...pause! } as MetricsState;
    return { ...base, ...(pause ?? {}) } as MetricsState;
  };

  const analyzePauseMetrics = async (blob: Blob) => {
    const AudioContextClass =
      window.AudioContext ||
      (
        window as unknown as {
          webkitAudioContext: typeof AudioContext;
        }
      ).webkitAudioContext;
    let audioContext: AudioContext | null = null;
    try {
      const arrayBuffer = await blob.arrayBuffer();
      audioContext = new AudioContextClass();
      const audioBuffer = await audioContext.decodeAudioData(
        arrayBuffer.slice(0),
      );
      const samples = audioBuffer.getChannelData(0);
      const result = analyzePausesFromSamples(samples, audioBuffer.sampleRate);
      setPauseMetrics(result);
      pauseMetricsRef.current = result;
      setMetrics((prev) => {
        if (prev && 'wordCount' in prev) {
          return {
            ...(prev as TranscribeMetrics & Partial<PauseMetrics>),
            ...result,
          } as MetricsState;
        }
        return { ...result } as MetricsState;
      });
    } catch (err) {
      console.error(err);
    } finally {
      void audioContext?.close?.();
    }
  };

  const revokeAudioObjectUrl = () => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      const rec = mediaRecorderRef.current;
      if (rec) {
        if (rec.state !== 'inactive') {
          rec.stop();
        }
        rec.stream?.getTracks().forEach((t) => t.stop());
      }
      revokeAudioObjectUrl();
    };
  }, []);

  useEffect(() => {
    const hasFeedback = feedback !== null;
    if (hasFeedback && !hadFeedbackRef.current) {
      feedbackRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    hadFeedbackRef.current = hasFeedback;
  }, [feedback]);

  const startRecording = async () => {
    try {
      revokeAudioObjectUrl();
      setAudioUrl(null);
      setAudioBlob(null);
      setMetrics(null);
      setPauseMetrics(null);
      pauseMetricsRef.current = null;
      setAnalytics(null);
      setCoach(null);
      setAudioDurationSeconds(null);
      setTranscriptionError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        revokeAudioObjectUrl();
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        setAudioUrl(url);
        setAudioBlob(blob);
        setAudioDurationSeconds(null);
        const audio = new Audio(url);
        audio.addEventListener('loadedmetadata', () => {
          if (Number.isFinite(audio.duration)) {
            setAudioDurationSeconds(audio.duration);
          }
        });
        stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        void analyzePauseMetrics(blob);
        setTimeout(() => {
          void transcribeBlob(blob, null);
        }, 300);
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    setIsRecording(false);
  };

  const transcribeBlob = async (
    blob: Blob,
    durationSeconds: number | null,
  ) => {
    setTranscribing(true);
    setTranscriptionError(null);
    setMetrics(null);
    setAnalytics(null);
    setCoach(null);

    try {
      const formData = new FormData();
      formData.append('file', blob, 'recording.webm');
      if (durationSeconds !== null && Number.isFinite(durationSeconds)) {
        formData.append('durationSeconds', String(durationSeconds));
      }

      // TEMP: experimental Deepgram path (revert to /api/transcribe for OpenAI)
      const res = await fetch('/api/transcribe-deepgram', {
        method: 'POST',
        body: formData,
      });

      const data = (await res.json()) as {
        text?: string;
        error?: string;
        metrics?: TranscribeMetrics;
        analytics?: DeepgramAnalytics;
        coach?: DeepgramCoachFeedback;
        words?: unknown;
      };

      if (!res.ok) {
        setTranscriptionError(data.error ?? 'Transcription failed');
        setMetrics(mergePauseIntoMetrics(null));
        setAnalytics(null);
        setCoach(null);
        return;
      }

      if (data.text !== undefined) {
        setAnswer(data.text);
      }
      setMetrics(mergePauseIntoMetrics(data.metrics ?? null));
      setAnalytics(data.analytics ?? null);
      setCoach(data.coach ?? null);
      setTranscriptEditing(false);
      setTranscriptionError(null);
    } catch {
      setTranscriptionError('Transcription failed');
      setMetrics(mergePauseIntoMetrics(null));
      setAnalytics(null);
      setCoach(null);
    } finally {
      setTranscribing(false);
    }
  };

  const handleTranscribe = async () => {
    if (!audioBlob) {
      setTranscriptionError('Record audio before transcribing.');
      return;
    }

    await transcribeBlob(audioBlob, audioDurationSeconds);
  };

  const handleSubmit = async () => {
    setFeedback(null);

    if (!answer.trim()) {
      setErrorMessage('Please enter an answer.');
      return;
    }

    setErrorMessage(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          question,
          answer,
          speechMetrics: metrics,
        }),
      });

      const result = (await res.json()) as {
        error?: string;
        feedback?: {
          strength: string;
          improvement: string;
          suggestion: string;
        };
      };

      if (!res.ok) {
        setErrorMessage(result.error ?? 'Something went wrong');
        return;
      }

      setErrorMessage(null);
      setFeedback(result.feedback ?? null);
      onSubmitted?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded border p-4 space-y-6">
      <h2 className="text-xl font-semibold">
        Question {questionNumber}
      </h2>

      <p>{question}</p>

      <div className="flex flex-wrap items-center gap-2">
        {!isRecording ? (
          <button
            type="button"
            className="rounded border border-gray-500 px-4 py-2 text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void startRecording()}
          >
            Start Recording
          </button>
        ) : (
          <button
            type="button"
            className="rounded border border-gray-500 px-4 py-2 text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={stopRecording}
          >
            Stop Recording
          </button>
        )}
        {audioBlob ? (
          <span className="text-sm text-green-700">Audio recorded</span>
        ) : null}
        <button
          type="button"
          className="rounded border border-gray-500 px-4 py-2 text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!audioBlob || transcribing}
          onClick={() => void handleTranscribe()}
        >
          {transcribing ? 'Transcribing...' : 'Transcribe Recording'}
        </button>
      </div>

      {transcriptionError ? (
        <p className="text-sm text-red-600" role="alert">
          {transcriptionError}
        </p>
      ) : null}

      {audioUrl ? (
        <audio controls src={audioUrl} className="w-full" />
      ) : null}

      {((metrics !== null || feedback !== null) && !transcriptEditing) ? (
        <div className="space-y-2">
          <div
            className="min-h-32 w-full rounded border p-3 text-left leading-relaxed"
            aria-label="Transcript with filler words highlighted"
          >
            <HighlightedTranscript text={answer} />
          </div>
          <button
            type="button"
            className="text-sm font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900"
            onClick={() => setTranscriptEditing(true)}
          >
            Edit transcript
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {(metrics !== null || feedback !== null) && transcriptEditing ? (
            <button
              type="button"
              className="text-sm font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900"
              onClick={() => setTranscriptEditing(false)}
            >
              Show highlighted transcript
            </button>
          ) : null}
          <textarea
            className="min-h-32 w-full rounded border p-3"
            placeholder="Type your answer here..."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </div>
      )}

      {metrics && 'wordCount' in metrics ? (
        <div className="text-sm text-gray-700">
          <p>Words: {metrics.wordCount}</p>
          <p>Duration: {Math.round(metrics.durationSeconds)}s</p>
          <p>WPM: {metrics.wordsPerMinute}</p>
          <p>{metrics.paceFeedback}</p>
          <p>Fillers: {metrics.fillerCount}</p>
          <p>{metrics.fillerFeedback}</p>
        </div>
      ) : null}

      {pauseMetrics ? (
        <div className="text-sm text-gray-700">
          <p>Pauses: {pauseMetrics.pauseCount}</p>
          <p>Longest pause: {pauseMetrics.longestPauseSeconds.toFixed(1)}s</p>
          <p>{pauseMetrics.pauseFeedback}</p>
        </div>
      ) : null}

      {analytics ? (
        <div className="space-y-4">
          <section className="rounded-lg border border-gray-200 bg-gray-50/90 p-4 shadow-sm dark:border-gray-600 dark:bg-gray-900/80">
            <h3 className="text-base font-semibold tracking-tight text-gray-950 dark:text-white">
              Speech Analytics
            </h3>

            {coach ? (
              (() => {
                const hP = pacingChip(coach.pacing.label);
                const hS = pausesChip(coach.pauses.label);
                const hC = consistencyChip(coach.consistency.label);
                return (
                  <div className="mt-4 flex flex-wrap items-end gap-4 border-b border-gray-200 pb-4 dark:border-gray-600">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
                        Overall score
                      </p>
                      <p className="mt-1 text-4xl font-bold tabular-nums leading-none text-gray-950 dark:text-white">
                        {coach.overallScore}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${hP.chipClass}`}
                      >
                        {hP.title}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${hS.chipClass}`}
                      >
                        {hS.title}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${hC.chipClass}`}
                      >
                        {hC.title}
                      </span>
                    </div>
                  </div>
                );
              })()
            ) : (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Coach summary unavailable for this response.
              </p>
            )}

            <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
              <div className="flex justify-between gap-2 border-b border-gray-100 pb-2 dark:border-gray-700/80 sm:block sm:border-0 sm:pb-0">
                <dt className="font-medium text-gray-600 dark:text-gray-400">
                  Speaking rate (WPM)
                </dt>
                <dd className="tabular-nums text-gray-800 dark:text-gray-200">
                  {analytics.speakingRateWpm}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-gray-100 pb-2 dark:border-gray-700/80 sm:block sm:border-0 sm:pb-0">
                <dt className="font-medium text-gray-600 dark:text-gray-400">
                  Speech ratio
                </dt>
                <dd className="tabular-nums text-gray-800 dark:text-gray-200">
                  {analytics.speechRatio}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-gray-100 pb-2 dark:border-gray-700/80 sm:block sm:border-0 sm:pb-0">
                <dt className="font-medium text-gray-600 dark:text-gray-400">
                  Pause count
                </dt>
                <dd className="tabular-nums text-gray-800 dark:text-gray-200">
                  {analytics.pauseCount}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-gray-100 pb-2 dark:border-gray-700/80 sm:block sm:border-0 sm:pb-0">
                <dt className="font-medium text-gray-600 dark:text-gray-400">
                  Long pause count
                </dt>
                <dd className="tabular-nums text-gray-800 dark:text-gray-200">
                  {analytics.longPauseCount}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-gray-100 pb-2 dark:border-gray-700/80 sm:block sm:border-0 sm:pb-0">
                <dt className="font-medium text-gray-600 dark:text-gray-400">
                  Consistency CV
                </dt>
                <dd className="tabular-nums text-gray-800 dark:text-gray-200">
                  {formatConsistencyNumber(
                    analytics.consistency?.bucketWpmCv ?? null,
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-gray-100 pb-2 dark:border-gray-700/80 sm:block sm:border-0 sm:pb-0">
                <dt className="font-medium text-gray-600 dark:text-gray-400">
                  Pacing trend
                </dt>
                <dd className="tabular-nums text-gray-800 dark:text-gray-200">
                  {formatConsistencyNumber(
                    analytics.consistency?.pacingTrendSlope ?? null,
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-gray-100 pb-2 dark:border-gray-700/80 sm:block sm:border-0 sm:pb-0">
                <dt className="font-medium text-gray-600 dark:text-gray-400">
                  Bucket count
                </dt>
                <dd className="tabular-nums text-gray-800 dark:text-gray-200">
                  {analytics.consistency?.bucketCount ?? '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="font-medium text-gray-600 dark:text-gray-400">
                  Bucket window (s)
                </dt>
                <dd className="tabular-nums text-gray-800 dark:text-gray-200">
                  {analytics.consistency?.bucketWindowSeconds ?? '—'}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] leading-snug text-gray-500 dark:text-gray-500">
              Experimental pacing consistency metrics — timeline buckets, not
              utterance segmentation.
            </p>
            {(() => {
              const note = pacingTrendInterpretation(
                analytics.consistency?.pacingTrendSlope ?? null,
              );
              return note ? (
                <p className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                  {note}
                </p>
              ) : null;
            })()}
          </section>

          {coach
            ? (() => {
                const chipP = pacingChip(coach.pacing.label);
                const chipS = pausesChip(coach.pauses.label);
                const chipC = consistencyChip(coach.consistency.label);
                return (
                  <section className="rounded-lg border border-gray-200 bg-gray-50/90 p-4 shadow-sm dark:border-gray-600 dark:bg-gray-900/80">
                    <h3 className="text-base font-semibold tracking-tight text-gray-950 dark:text-white">
                      Coach Feedback
                    </h3>
                    <div className="mt-4 space-y-5">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                            Pacing
                          </span>
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${chipP.chipClass}`}
                          >
                            {chipP.title}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                          {coach.pacing.explanation}
                        </p>
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                            Pauses
                          </span>
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${chipS.chipClass}`}
                          >
                            {chipS.title}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                          {coach.pauses.explanation}
                        </p>
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                            Consistency
                          </span>
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${chipC.chipClass}`}
                          >
                            {chipC.title}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                          {coach.consistency.explanation}
                        </p>
                      </div>
                    </div>

                    {coach.suggestions.length > 0 ? (
                      <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-600">
                        <h4 className="text-sm font-semibold text-gray-950 dark:text-white">
                          Suggestions
                        </h4>
                        <ul className="mt-3 space-y-2">
                          {coach.suggestions.map((s, i) => (
                            <li
                              key={i}
                              className="rounded-md border border-gray-200 bg-white/80 px-3 py-2.5 text-sm leading-relaxed text-gray-800 dark:border-gray-600 dark:bg-gray-950/50 dark:text-gray-200"
                            >
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </section>
                );
              })()
            : null}
        </div>
      ) : null}

      {errorMessage ? (
        <p className="text-sm text-red-600" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {feedback ? (
        <div
          ref={feedbackRef}
          className="space-y-3 rounded border border-green-200 bg-green-50/80 p-4 text-sm"
          role="status"
        >
          <div>
            <p className="font-semibold text-gray-900">Strength</p>
            <p className="text-gray-800">{feedback.strength}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Improvement</p>
            <p className="text-gray-800">{feedback.improvement}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Suggestion</p>
            <p className="text-gray-800">{feedback.suggestion}</p>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="rounded bg-white px-4 py-2 text-black hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={submitting}
        onClick={() => void handleSubmit()}
      >
        {submitting ? 'Submitting...' : 'Submit Answer'}
      </button>
    </section>
  );
}
