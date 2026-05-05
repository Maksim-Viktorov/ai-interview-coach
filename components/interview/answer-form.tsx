'use client';

import { useEffect, useRef, useState } from 'react';
import { HighlightedTranscript } from '@/components/interview/highlighted-transcript';

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
  const [metrics, setMetrics] = useState<TranscribeMetrics | null>(null);
  const [audioDurationSeconds, setAudioDurationSeconds] = useState<
    number | null
  >(null);
  const [transcriptEditing, setTranscriptEditing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioUrlRef = useRef<string | null>(null);
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const hadFeedbackRef = useRef(false);

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

    try {
      const formData = new FormData();
      formData.append('file', blob, 'recording.webm');
      if (durationSeconds !== null && Number.isFinite(durationSeconds)) {
        formData.append('durationSeconds', String(durationSeconds));
      }

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      const data = (await res.json()) as {
        text?: string;
        error?: string;
        metrics?: TranscribeMetrics;
      };

      if (!res.ok) {
        setTranscriptionError(data.error ?? 'Transcription failed');
        return;
      }

      if (data.text !== undefined) {
        setAnswer(data.text);
      }
      setMetrics(data.metrics ?? null);
      setTranscriptEditing(false);
      setTranscriptionError(null);
    } catch {
      setTranscriptionError('Transcription failed');
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

      {metrics ? (
        <div className="text-sm text-gray-700">
          <p>Words: {metrics.wordCount}</p>
          <p>Duration: {Math.round(metrics.durationSeconds)}s</p>
          <p>WPM: {metrics.wordsPerMinute}</p>
          <p>{metrics.paceFeedback}</p>
          <p>Fillers: {metrics.fillerCount}</p>
          <p>{metrics.fillerFeedback}</p>
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
