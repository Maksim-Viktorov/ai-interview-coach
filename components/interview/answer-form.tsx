'use client';

import { useEffect, useRef, useState } from 'react';
import { HighlightedTranscript } from '@/components/interview/highlighted-transcript';
import { CameraPreview } from '@/components/interview/camera-preview';
import { EngagementSection } from '@/components/interview/engagement-section';
import { CoachFeedbackSection } from '@/components/interview/coach-ui';
import { SpeechAnalyticsSection } from '@/components/interview/speech-analytics-section';
import { GradientButton } from '@/components/ui/gradient-button';
import { OutlineButton } from '@/components/ui/outline-button';
import {
  analyzePausesFromSamples,
  type PauseMetrics,
} from '@/lib/pause-analysis';
import type { DeepgramAnalytics } from '@/lib/deepgram-analytics';
import type { DeepgramCoachFeedback } from '@/lib/deepgram-coach';
import {
  useGazeTracking,
  type GazeMetricsSnapshot,
} from '@/hooks/useGazeTracking';

type AnswerFormProps = {
  sessionId: string;
  question: string;
  questionId: string;
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

type RecordingPanelState =
  | 'idle'
  | 'recording'
  | 'stopped'
  | 'transcribing'
  | 'transcribed';

function formatRecordingTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function deriveRecordingPanelState(
  isRecording: boolean,
  transcribing: boolean,
  audioBlob: Blob | null,
  analytics: DeepgramAnalytics | null,
): RecordingPanelState {
  if (isRecording) return 'recording';
  if (transcribing) return 'transcribing';
  if (audioBlob && analytics) return 'transcribed';
  if (audioBlob && !analytics) return 'stopped';
  return 'idle';
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl border border-score-bad/30 bg-score-bad/5 px-4 py-3"
      role="alert"
    >
      <p className="font-body text-sm text-score-bad">{message}</p>
    </div>
  );
}

export function AnswerForm({
  sessionId,
  question,
  questionId,
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
  const [analytics, setAnalytics] = useState<DeepgramAnalytics | null>(null);
  const [coachScorecard, setCoachScorecard] =
    useState<DeepgramCoachFeedback | null>(null);
  const [cameraPermission, setCameraPermission] = useState<
    'unrequested' | 'granted' | 'denied'
  >('unrequested');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedEngagement, setCapturedEngagement] =
    useState<GazeMetricsSnapshot | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const { state: gazeState, controls: gazeControls } = useGazeTracking();
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const usedCameraThisRecordingRef = useRef(false);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioUrlRef = useRef<string | null>(null);
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const hadFeedbackRef = useRef(false);
  const pauseMetricsRef = useRef<PauseMetrics | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);

  const panelState = deriveRecordingPanelState(
    isRecording,
    transcribing,
    audioBlob,
    analytics,
  );

  const showTranscript =
    analytics != null && feedback == null && !transcribing;

  const canSubmit =
    !submitting &&
    !isRecording &&
    !transcribing &&
    analytics != null &&
    coachScorecard != null;

  useEffect(() => {
    cameraStreamRef.current = cameraStream;
  }, [cameraStream]);

  useEffect(() => {
    if (!isRecording || !cameraStream) {
      return;
    }
    const id = requestAnimationFrame(() => {
      const el = cameraVideoRef.current;
      if (el) void gazeControls.startTracking(el);
    });
    return () => {
      cancelAnimationFrame(id);
      gazeControls.stopTracking();
    };
  }, [isRecording, cameraStream, gazeControls]);

  useEffect(() => {
    if (!isRecording) {
      recordingStartedAtRef.current = null;
      setRecordingSeconds(0);
      return;
    }
    recordingStartedAtRef.current = Date.now();
    setRecordingSeconds(0);
    const intervalId = window.setInterval(() => {
      if (recordingStartedAtRef.current != null) {
        setRecordingSeconds(
          Math.floor((Date.now() - recordingStartedAtRef.current) / 1000),
        );
      }
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [isRecording]);

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
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
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
      setFeedback(null);
      setAnswer('');
      setAnalytics(null);
      setCoachScorecard(null);
      setMetrics(null);
      pauseMetricsRef.current = null;
      setCapturedEngagement(null);
      setTranscriptionError(null);
      setErrorMessage(null);
      gazeControls.resetForNewRecording();
      usedCameraThisRecordingRef.current = false;

      revokeAudioObjectUrl();
      setAudioUrl(null);
      setAudioBlob(null);

      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      const videoStream = await navigator.mediaDevices
        .getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        })
        .catch(() => null);

      if (videoStream) {
        usedCameraThisRecordingRef.current = true;
        setCameraPermission('granted');
        setCameraStream(videoStream);
      } else {
        usedCameraThisRecordingRef.current = false;
        setCameraPermission('denied');
        setCameraStream(null);
      }

      chunksRef.current = [];

      const recorder = new MediaRecorder(audioStream);
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

        const hadCamera = usedCameraThisRecordingRef.current;
        const gazeSnap = hadCamera ? gazeControls.getSnapshot() : null;
        gazeControls.stopTracking();

        const camStream = cameraStreamRef.current;
        if (camStream) {
          camStream.getTracks().forEach((t) => t.stop());
        }
        cameraStreamRef.current = null;
        setCameraStream(null);

        setCapturedEngagement(gazeSnap);
        setIsRecording(false);

        revokeAudioObjectUrl();
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        setAudioUrl(url);
        setAudioBlob(blob);
        setAudioDurationSeconds(null);
        const audioLoad = new Audio(url);
        audioLoad.addEventListener('loadedmetadata', () => {
          if (Number.isFinite(audioLoad.duration)) {
            setAudioDurationSeconds(audioLoad.duration);
          }
        });
        audioStream.getTracks().forEach((t) => t.stop());
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
      setCameraStream(null);
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
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

    if (!analytics || !coachScorecard) {
      setErrorMessage('Record your answer to submit');
      return;
    }

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
          questionId,
          answer,
          speechMetrics: metrics,
          scorecard: coachScorecard,
          analytics,
          gazeMetrics: capturedEngagement ?? undefined,
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

  const renderRecordingPanel = () => {
    switch (panelState) {
      case 'idle':
        return (
          <div className="flex flex-col items-center gap-4 text-center">
            <GradientButton size="large" onClick={() => void startRecording()}>
              Start Recording
            </GradientButton>
            <p className="font-body text-sm text-text-secondary">
              Click to begin recording your answer
            </p>
            {cameraPermission === 'granted' ? (
              <p className="font-body text-xs text-score-good">
                Camera enabled
              </p>
            ) : null}
            {cameraPermission === 'denied' ? (
              <p className="font-body text-xs text-text-muted">
                Camera disabled — engagement metrics unavailable
              </p>
            ) : null}
          </div>
        );

      case 'recording':
        return (
          <div className="flex w-full flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 animate-pulse"
                  aria-hidden
                />
                <span className="font-display text-2xl font-bold tabular-nums text-text-primary">
                  {formatRecordingTime(recordingSeconds)}
                </span>
              </div>
              <p className="font-body text-sm text-text-secondary">
                Recording...
              </p>
            </div>
            {cameraStream ? (
              <CameraPreview
                ref={cameraVideoRef}
                stream={cameraStream}
                isLookingAtCamera={gazeState.isLookingAtCamera}
                isCalibrating={gazeState.isCalibrating}
                isFaceDetected={gazeState.isFaceDetected}
              />
            ) : null}
            <OutlineButton type="button" onClick={stopRecording}>
              Stop Recording
            </OutlineButton>
          </div>
        );

      case 'stopped':
        return (
          <div className="flex w-full flex-col items-center gap-6">
            <p className="font-display text-lg font-semibold text-text-primary">
              Recording complete
            </p>
            {audioUrl ? (
              <audio controls src={audioUrl} className="w-full rounded-lg" />
            ) : null}
            <div className="flex flex-wrap justify-center gap-3">
              <GradientButton
                type="button"
                onClick={() => void handleTranscribe()}
                disabled={!audioBlob || transcribing}
              >
                Transcribe
              </GradientButton>
              <OutlineButton type="button" onClick={() => void startRecording()}>
                Re-record
              </OutlineButton>
            </div>
          </div>
        );

      case 'transcribing':
        return (
          <div className="flex flex-col items-center gap-4 py-4">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
              aria-hidden
            />
            <p className="font-body text-sm text-text-secondary">
              Transcribing your audio...
            </p>
          </div>
        );

      case 'transcribed':
        return (
          <div className="flex w-full flex-col items-center gap-6">
            <p className="font-display text-lg font-semibold text-text-primary">
              Recording complete
            </p>
            {audioUrl ? (
              <audio controls src={audioUrl} className="w-full rounded-lg" />
            ) : null}
            <OutlineButton type="button" onClick={() => void startRecording()}>
              Re-record
            </OutlineButton>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="w-full space-y-8">
      <div className="rounded-2xl border border-border bg-surface-soft p-8">
        {renderRecordingPanel()}
      </div>

      {transcriptionError ? <ErrorAlert message={transcriptionError} /> : null}

      {showTranscript ? (
        <div className="space-y-3">
          <label
            htmlFor="answer-transcript"
            className="font-body text-sm font-semibold text-text-primary"
          >
            Your transcribed answer
          </label>
          <textarea
            id="answer-transcript"
            className="w-full min-h-[200px] rounded-xl border border-border bg-surface px-5 py-4 font-body text-base leading-relaxed text-text-primary transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            placeholder="Your transcribed answer will appear here. You can edit it to fix mistranscriptions before submitting."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            aria-label="Answer"
          />
          <p className="font-body text-sm text-text-secondary">
            Edit any mistranscriptions before submitting. The original audio is
            what gets scored for delivery.
          </p>
        </div>
      ) : null}

      {feedback == null ? (
        <div className="pt-4">
          <GradientButton
            size="large"
            className="w-full"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            {submitting ? 'Submitting...' : 'Submit Answer'}
          </GradientButton>
          {!canSubmit && !submitting ? (
            <p className="mt-2 text-center font-body text-sm text-text-secondary">
              Record your answer to submit
            </p>
          ) : null}
        </div>
      ) : null}

      {errorMessage ? <ErrorAlert message={errorMessage} /> : null}

      {feedback ? (
        <div ref={feedbackRef} className="space-y-6" role="status">
          {analytics ? (
            <div
              className="min-h-32 w-full rounded border p-3 text-left leading-relaxed"
              aria-label="Answer transcript with filler highlights"
            >
              <HighlightedTranscript text={answer} />
            </div>
          ) : null}

          <SpeechAnalyticsSection
            analytics={analytics}
            scorecard={coachScorecard}
          />

          <EngagementSection metrics={capturedEngagement} />

          <CoachFeedbackSection
            feedbackRaw={JSON.stringify({
              strength: feedback.strength,
              improvement: feedback.improvement,
              suggestion: feedback.suggestion,
            })}
          />
        </div>
      ) : null}
    </div>
  );
}
