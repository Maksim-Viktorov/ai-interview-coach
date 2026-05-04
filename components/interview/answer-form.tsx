'use client';

import { useState } from 'react';

type AnswerFormProps = {
  sessionId: string;
  question: string;
};

type FeedbackState = {
  strength: string;
  improvement: string;
  suggestion: string;
};

export function AnswerForm({ sessionId, question }: AnswerFormProps) {
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

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
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-8 rounded border p-4">
      <h2 className="mb-2 text-xl font-semibold">Question 1</h2>

      <p className="mb-4">{question}</p>

      <textarea
        className="min-h-32 w-full rounded border p-3"
        placeholder="Type your answer here..."
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
      />

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
