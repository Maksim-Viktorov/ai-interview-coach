'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HighlightedTranscript } from '@/components/interview/highlighted-transcript';
import {
  analyzePausesFromSamples,
  type PauseMetrics,
} from '@/lib/pause-analysis';
import type { DeepgramAnalytics, PacingAnalysis } from '@/lib/deepgram-analytics';
import type { DeepgramCoachFeedback, DimensionScore } from '@/lib/deepgram-coach';
import { SpeakingPaceOverTimeChart } from '@/components/interview/speaking-pace-over-time-chart';

function DimensionScoreCard({
  title,
  dim,
  footer,
}: {
  title: string;
  dim: DimensionScore;
  footer?: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-600 dark:bg-gray-950/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
        {title}
      </p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-gray-950 dark:text-white">
        {dim.score === null ? '—' : dim.score}
      </p>
      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
        {dim.label}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
        {dim.comment}
      </p>
      {dim.score !== null ? (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500"
            style={{ width: `${dim.score}%` }}
          />
        </div>
      ) : null}
      {footer ? <div className="mt-3 border-t border-gray-100 pt-2 dark:border-gray-700">{footer}</div> : null}
    </div>
  );
}

/** Phase 1 pacing curve copy — verbatim label + helper for UI descriptor. */
function pacingCurveDescriptor(shape: PacingAnalysis['shape']): {
  label: string;
  helper: string;
} | null {
  switch (shape) {
    case 'insufficient':
      return null;
    case 'steady':
      return {
        label: 'Steady',
        helper: 'Consistent pace throughout, easy to follow',
      };
    case 'accelerating':
      return {
        label: 'Accelerating',
        helper: 'You built momentum, good energy',
      };
    case 'decelerating':
      return {
        label: 'Decelerating',
        helper:
          'You slowed toward the end, make sure your conclusion lands',
      };
    case 'strong-start':
      return {
        label: 'Front-loaded',
        helper:
          'You opened strongly then settled into a slower pace',
      };
    case 'strong-finish':
      return {
        label: 'Back-loaded',
        helper: 'You warmed up as you went',
      };
    case 'wave':
      return {
        label: 'Variable',
        helper: 'Rhythmic pace variation, natural emphasis',
      };
    case 'erratic':
      return {
        label: 'Erratic',
        helper:
          'Your pace varied unpredictably, work on smoother transitions',
      };
    default:
      return null;
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
  const [audioDurationSeconds, setAudioDurationSeconds] = useState<
    number | null
  >(null);
  const [transcriptEditing, setTranscriptEditing] = useState(false);
  const [analytics, setAnalytics] = useState<DeepgramAnalytics | null>(null);
  const [coachScorecard, setCoachScorecard] =
    useState<DeepgramCoachFeedback | null>(null);

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
      pauseMetricsRef.current = null;
      setAnalytics(null);
      setCoachScorecard(null);
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
    setCoachScorecard(null);

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
        setCoachScorecard(null);
        return;
      }

      if (data.text !== undefined) {
        setAnswer(data.text);
      }
      setMetrics(mergePauseIntoMetrics(data.metrics ?? null));
      setAnalytics(data.analytics ?? null);
      setCoachScorecard(data.coach ?? null);
      setTranscriptEditing(false);
      setTranscriptionError(null);
    } catch {
      setTranscriptionError('Transcription failed');
      setMetrics(mergePauseIntoMetrics(null));
      setAnalytics(null);
      setCoachScorecard(null);
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
            aria-label="Answer transcript"
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

      {analytics ? (
        <section className="rounded-lg border border-gray-200 bg-gray-50/90 p-4 shadow-sm dark:border-gray-600 dark:bg-gray-900/80">
          <h3 className="text-base font-semibold tracking-tight text-gray-950 dark:text-white">
            Speech Analytics
          </h3>

          {(() => {
            const wpmFinite = Number.isFinite(analytics.speakingRateWpm);
            const wpmHeadline = wpmFinite
              ? `${Math.round(analytics.speakingRateWpm)} WPM`
              : '—';
            const pa = analytics.consistency.pacingAnalysis;
            const curve = pacingCurveDescriptor(pa.shape);
            const paceOverTimeData =
              analytics.consistency.pacingWindows.map((p) => ({
                time: p.midTime,
                wpm: p.wpm,
              }));

            const dynamismFooter =
              curve == null ? null : (
                <div className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                  <p className="font-medium text-gray-800 dark:text-gray-200">
                    Curve shape: {curve.label}
                  </p>
                  <p className="mt-0.5">{curve.helper}</p>
                </div>
              );

            return (
              <>
                <div className="mt-4 flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                    Speaking rate
                  </span>
                  <span className="text-lg font-bold tabular-nums text-gray-950 dark:text-white">
                    {wpmHeadline}
                  </span>
                </div>

                {coachScorecard ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <DimensionScoreCard title="Pace" dim={coachScorecard.pace} />
                    <DimensionScoreCard
                      title="Fluency"
                      dim={coachScorecard.fluency}
                    />
                    <DimensionScoreCard
                      title="Cleanliness"
                      dim={coachScorecard.cleanliness}
                    />
                    <DimensionScoreCard
                      title="Dynamism"
                      dim={coachScorecard.dynamism}
                      footer={dynamismFooter}
                    />
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                    Delivery scorecard was not returned for this transcription.
                  </p>
                )}

                <div className="mt-6">
                  <SpeakingPaceOverTimeChart data={paceOverTimeData} />
                </div>
              </>
            );
          })()}
        </section>
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
