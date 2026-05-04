'use client';

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
      <p className="text-lg font-medium" role="status">
        Interview complete
      </p>
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
    <div className="space-y-4">
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
        className="rounded bg-gray-200 px-4 py-2 font-medium hover:bg-gray-300 disabled:pointer-events-none disabled:opacity-40"
        disabled={!submittedCurrentQuestion}
        onClick={handleNext}
      >
        {isLastQuestion ? 'Finish interview' : 'Next Question'}
      </button>
    </div>
  );
}
