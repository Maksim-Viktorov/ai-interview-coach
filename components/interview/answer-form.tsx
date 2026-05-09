'use client';

import { useEffect, useRef, useState } from 'react';
import { HighlightedTranscript } from '@/components/interview/highlighted-transcript';
import {
  analyzePausesFromSamples,
  type PauseMetrics,
} from '@/lib/pause-analysis';
import type { DeepgramAnalytics, PacingAnalysis } from '@/lib/deepgram-analytics';
import { SpeakingPaceOverTimeChart } from '@/components/interview/speaking-pace-over-time-chart';

const CHIP_POSITIVE =
  'border-emerald-500/55 bg-emerald-500/15 text-emerald-950 dark:border-emerald-400/45 dark:bg-emerald-500/20 dark:text-emerald-50';
const CHIP_CAUTION =
  'border-amber-500/55 bg-amber-500/15 text-amber-950 dark:border-amber-400/45 dark:bg-amber-500/18 dark:text-amber-50';
const CHIP_ATTENTION =
  'border-orange-500/55 bg-orange-500/15 text-orange-950 dark:border-orange-400/45 dark:bg-orange-500/18 dark:text-orange-50';

function speakingPaceDisplay(wpm: number): {
  label: string;
  helper: string;
  chipClass: string;
} {
  if (!Number.isFinite(wpm)) {
    return {
      label: '—',
      helper: '',
      chipClass: CHIP_CAUTION,
    };
  }
  if (wpm < 110) {
    return {
      label: 'Too Slow',
      helper: 'You may sound uncertain or under-prepared.',
      chipClass: CHIP_CAUTION,
    };
  }
  if (wpm < 130) {
    return {
      label: 'Slightly Slow',
      helper: 'Good for complex topics, but avoid dragging.',
      chipClass: CHIP_CAUTION,
    };
  }
  if (wpm < 170) {
    return {
      label: 'Ideal',
      helper: 'Clear, confident, and easy to follow.',
      chipClass: CHIP_POSITIVE,
    };
  }
  if (wpm <= 190) {
    return {
      label: 'Slightly Fast',
      helper: 'Slow down slightly to let key points land.',
      chipClass: CHIP_CAUTION,
    };
  }
  return {
    label: 'Too Fast',
    helper: 'You may be rushing or sounding nervous.',
    chipClass: CHIP_ATTENTION,
  };
}

function pacingAnalysisShapeDisplay(shape: PacingAnalysis['shape']): {
  label: string;
  helper: string;
  chipClass: string;
} | null {
  switch (shape) {
    case 'insufficient':
      return null;
    case 'steady':
      return {
        label: 'Stable',
        helper: 'You maintained a consistent pace throughout.',
        chipClass: CHIP_POSITIVE,
      };
    case 'accelerating':
      return {
        label: 'Accelerating',
        helper:
          'You sped up as you went, which can read as nervousness.',
        chipClass: CHIP_CAUTION,
      };
    case 'decelerating':
      return {
        label: 'Decelerating',
        helper:
          "You slowed toward the end — check you're not losing confidence.",
        chipClass: CHIP_CAUTION,
      };
    case 'strong-start':
      return {
        label: 'Strong start',
        helper:
          'Energy was higher early than late — consider a more even arc.',
        chipClass: CHIP_CAUTION,
      };
    case 'strong-finish':
      return {
        label: 'Strong finish',
        helper:
          'You built momentum toward the end — keep transitions smooth.',
        chipClass: CHIP_POSITIVE,
      };
    case 'wave':
      return {
        label: 'Wave pattern',
        helper:
          'Pace varied across the middle vs. ends — steadier delivery often lands better.',
        chipClass: CHIP_CAUTION,
      };
    case 'erratic':
      return {
        label: 'Erratic',
        helper:
          'Your pace varied unpredictably throughout — focus on steadying your delivery',
        chipClass: CHIP_ATTENTION,
      };
    default:
      return null;
  }
}

function fluencyScoreDisplay(analysis: PacingAnalysis): {
  headline: string;
  label: string;
  comment: string;
  chipClass: string;
} | null {
  if (analysis.shape === 'insufficient') {
    return null;
  }
  const s = analysis.fluencyScore;
  const headline = String(Math.round(s));
  if (s >= 85) {
    return {
      headline,
      label: 'Excellent',
      comment: 'Smooth, natural transitions throughout',
      chipClass: CHIP_POSITIVE,
    };
  }
  if (s >= 70) {
    return {
      headline,
      label: 'Good',
      comment: 'Mostly fluid with minor variation',
      chipClass: CHIP_POSITIVE,
    };
  }
  if (s >= 50) {
    return {
      headline,
      label: 'Moderate',
      comment:
        'Some abrupt pace changes — work on smoother transitions',
      chipClass: CHIP_CAUTION,
    };
  }
  return {
    headline,
    label: 'Needs work',
    comment: 'Delivery was choppy — focus on evening out your pace',
    chipClass: CHIP_ATTENTION,
  };
}

function activeSpeechDisplay(ratio: number): {
  pct: number;
  label: string;
  comment: string;
  chipClass: string;
} {
  if (!Number.isFinite(ratio)) {
    return {
      pct: 0,
      label: '—',
      comment: '',
      chipClass: CHIP_CAUTION,
    };
  }
  const clamped = Math.min(1, Math.max(0, ratio));
  const pct = Math.round(clamped * 100);
  const r = clamped;
  if (r > 0.85) {
    return {
      pct,
      label: 'High energy delivery',
      comment:
        'You filled your answer well and kept strong verbal flow.',
      chipClass: CHIP_POSITIVE,
    };
  }
  if (r >= 0.7) {
    return {
      pct,
      label: 'Solid delivery',
      comment:
        'Good use of your answer time with natural pacing and rhythm.',
      chipClass: CHIP_POSITIVE,
    };
  }
  if (r >= 0.55) {
    return {
      pct,
      label: 'Moderate delivery',
      comment:
        'Room to develop your answer further — some gaps were present.',
      chipClass: CHIP_CAUTION,
    };
  }
  return {
    pct,
    label: 'Low fluency',
    comment:
      'Your answer had significant gaps — aim to expand and maintain flow.',
    chipClass: CHIP_ATTENTION,
  };
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
        words?: unknown;
      };

      if (!res.ok) {
        setTranscriptionError(data.error ?? 'Transcription failed');
        setMetrics(mergePauseIntoMetrics(null));
        setAnalytics(null);
        return;
      }

      if (data.text !== undefined) {
        setAnswer(data.text);
      }
      setMetrics(mergePauseIntoMetrics(data.metrics ?? null));
      setAnalytics(data.analytics ?? null);
      setTranscriptEditing(false);
      setTranscriptionError(null);
    } catch {
      setTranscriptionError('Transcription failed');
      setMetrics(mergePauseIntoMetrics(null));
      setAnalytics(null);
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
            const pace = speakingPaceDisplay(analytics.speakingRateWpm);
            const wpmFinite = Number.isFinite(analytics.speakingRateWpm);
            const wpmHeadline = wpmFinite
              ? `${Math.round(analytics.speakingRateWpm)} WPM`
              : '—';
            const pa = analytics.consistency.pacingAnalysis;
            const trend = pacingAnalysisShapeDisplay(pa.shape);
            const fluency = fluencyScoreDisplay(pa);
            const speech = activeSpeechDisplay(analytics.speechRatio);
            const paceOverTimeData =
              analytics.consistency.pacingWindows.map((p) => ({
                time: p.midTime,
                wpm: p.wpm,
              }));

            return (
              <>
                <div className="mt-4 space-y-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Speaking pace
                    </p>
                    <div className="mt-2 flex flex-wrap items-baseline gap-3">
                      <span className="text-3xl font-bold tabular-nums text-gray-950 dark:text-white">
                        {wpmHeadline}
                      </span>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${pace.chipClass}`}
                      >
                        {pace.label}
                      </span>
                    </div>
                    {pace.helper ? (
                      <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                        {pace.helper}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                        Pacing pattern
                      </p>
                      {trend ? (
                        <>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${trend.chipClass}`}
                            >
                              {trend.label}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                            {trend.helper}
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          Not enough data to assess pacing pattern.
                        </p>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                        Delivery fluency
                      </p>
                      {fluency ? (
                        <>
                          <div className="mt-2 flex flex-wrap items-baseline gap-3">
                            <span className="text-3xl font-bold tabular-nums text-gray-950 dark:text-white">
                              {fluency.headline}
                            </span>
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${fluency.chipClass}`}
                            >
                              {fluency.label}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                            {fluency.comment}
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          Not enough data to score fluency.
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Active speech
                    </p>
                    <div className="mt-2 flex flex-wrap items-baseline gap-3">
                      <span className="text-2xl font-bold tabular-nums text-gray-950 dark:text-white">
                        {speech.pct}%
                      </span>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${speech.chipClass}`}
                      >
                        {speech.label}
                      </span>
                    </div>
                    {speech.comment ? (
                      <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                        {speech.comment}
                      </p>
                    ) : null}
                  </div>
                </div>
                <SpeakingPaceOverTimeChart data={paceOverTimeData} />
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
