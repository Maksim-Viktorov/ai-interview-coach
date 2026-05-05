'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AnswerForm } from '@/components/interview/answer-form';

type InterviewFlowProps = {
  sessionId: string;
  questions: string[];
};

export function InterviewFlow({ sessionId, questions }: InterviewFlowProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [submittedCurrentQuestion, setSubmittedCurrentQuestion] =
    useState(false);

  if (questions.length === 0) {
    return null;
  }

  if (currentQuestionIndex >= questions.length) {
    return (
      <div className="space-y-6" role="status">
        <div>
          <p className="text-2xl font-semibold">🎉 Interview complete!</p>
          <p className="text-sm text-gray-600">You answered all questions.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded bg-white px-4 py-2 text-black hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start new interview
          </Link>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const total = questions.length;
  const displayNumber = currentQuestionIndex + 1;

  const handleNext = () => {
    setCurrentQuestionIndex((i) => i + 1);
    setSubmittedCurrentQuestion(false);
  };

  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Question {displayNumber} of {total}
      </p>

      <AnswerForm
        key={currentQuestionIndex}
        sessionId={sessionId}
        question={currentQuestion}
        questionNumber={displayNumber}
        onSubmitted={() => setSubmittedCurrentQuestion(true)}
      />

      <button
        type="button"
        className="rounded bg-white px-4 py-2 text-black hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!submittedCurrentQuestion}
        onClick={handleNext}
      >
        {isLastQuestion ? 'Finish interview' : 'Next Question'}
      </button>
    </div>
  );
}
