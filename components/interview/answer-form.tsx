'use client';

import { useEffect, useRef, useState } from 'react';

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
  const [metrics, setMetrics] = useState<TranscribeMetrics | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioUrlRef = useRef<string | null>(null);

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

  const startRecording = async () => {
    try {
      revokeAudioObjectUrl();
      setAudioUrl(null);
      setAudioBlob(null);
      setMetrics(null);
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
        console.log(blob);
        stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
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

  const handleTranscribe = async () => {
    if (!audioBlob) {
      return;
    }

    setTranscribing(true);
    setErrorMessage(null);
    setMetrics(null);

    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');

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
        setErrorMessage(data.error ?? 'Transcription failed');
        return;
      }

      if (data.text !== undefined) {
        setAnswer(data.text);
      }
      setMetrics(data.metrics ?? null);
    } catch {
      setErrorMessage('Transcription failed');
    } finally {
      setTranscribing(false);
    }
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
      setAnswer('');
      setMetrics(null);
      onSubmitted?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded border p-4">
      <h2 className="mb-2 text-xl font-semibold">
        Question {questionNumber}
      </h2>

      <p className="mb-4">{question}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!isRecording ? (
          <button
            type="button"
            className="rounded bg-gray-700 px-3 py-2 text-sm text-white hover:bg-gray-600"
            onClick={() => void startRecording()}
          >
            Start Recording
          </button>
        ) : (
          <button
            type="button"
            className="rounded bg-red-700 px-3 py-2 text-sm text-white hover:bg-red-600"
            onClick={stopRecording}
          >
            Stop Recording
          </button>
        )}
        {audioBlob ? (
          <span className="text-sm text-green-700">Audio recorded</span>
        ) : null}
        {audioBlob ? (
          <button
            type="button"
            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            disabled={transcribing}
            onClick={() => void handleTranscribe()}
          >
            Transcribe Recording
          </button>
        ) : null}
      </div>

      {audioUrl ? (
        <audio controls src={audioUrl} className="mt-2 w-full" />
      ) : null}

      <textarea
        className="min-h-32 w-full rounded border p-3"
        placeholder="Type your answer here..."
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
      />

      {metrics ? (
        <div className="mt-4 text-sm text-gray-700">
          <p>Words: {metrics.wordCount}</p>
          <p>Duration: {Math.round(metrics.durationSeconds)}s</p>
          <p>WPM: {metrics.wordsPerMinute}</p>
          <p>{metrics.paceFeedback}</p>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {feedback ? (
        <div
          className="mt-4 space-y-3 rounded border border-green-200 bg-green-50/80 p-4 text-sm"
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
        className="mt-4 rounded bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
        disabled={submitting}
        onClick={() => void handleSubmit()}
      >
        Submit Answer
      </button>
    </section>
  );
}
