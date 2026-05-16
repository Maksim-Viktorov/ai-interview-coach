'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AnswerForm } from '@/components/interview/answer-form';

type InterviewFlowProps = {
  sessionId: string;
  questions: string[];
  questionIds: string[];
};

export function InterviewFlow({
  sessionId,
  questions,
  questionIds,
}: InterviewFlowProps) {
  const router = useRouter();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [submittedCurrentQuestion, setSubmittedCurrentQuestion] =
    useState(false);

  if (questions.length === 0 || questions.length !== questionIds.length) {
    return (
      <p className="text-sm text-red-600" role="alert">
        Invalid question configuration for this session.
      </p>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const currentQuestionId = questionIds[currentQuestionIndex];
  const total = questions.length;
  const displayNumber = currentQuestionIndex + 1;
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  const handleNext = () => {
    if (isLastQuestion) {
      router.push(`/interview/${sessionId}/summary`);
      return;
    }
    setCurrentQuestionIndex((i) => i + 1);
    setSubmittedCurrentQuestion(false);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Question {displayNumber} of {total}
      </p>

      <AnswerForm
        key={currentQuestionIndex}
        sessionId={sessionId}
        question={currentQuestion}
        questionId={currentQuestionId!}
        questionNumber={displayNumber}
        onSubmitted={() => setSubmittedCurrentQuestion(true)}
      />

      <button
        type="button"
        className="rounded bg-white px-4 py-2 text-black hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-200"
        disabled={!submittedCurrentQuestion}
        onClick={handleNext}
      >
        {isLastQuestion ? 'Finish interview' : 'Next Question'}
      </button>
    </div>
  );
}
