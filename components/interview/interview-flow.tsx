'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AnswerForm } from '@/components/interview/answer-form';
import { GradientButton } from '@/components/ui/gradient-button';

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
      <p className="font-body text-sm text-score-bad" role="alert">
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
    <div>
      <div className="mb-12 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {questions.map((_, index) => (
            <span
              key={index}
              className={`
                h-2.5 w-2.5 rounded-full transition-colors duration-300
                ${index === currentQuestionIndex ? 'bg-brand' : ''}
                ${index < currentQuestionIndex ? 'bg-brand opacity-40' : ''}
                ${index > currentQuestionIndex ? 'border-2 border-border bg-transparent' : ''}
              `}
            />
          ))}
        </div>
        <p className="font-body text-sm text-text-secondary">
          Question {displayNumber} of {total}
        </p>
      </div>

      <div className="mb-10">
        <h1 className="font-display text-3xl font-bold leading-tight text-text-primary md:text-4xl">
          {currentQuestion}
        </h1>
      </div>

      <AnswerForm
        key={currentQuestionIndex}
        sessionId={sessionId}
        question={currentQuestion}
        questionId={currentQuestionId!}
        onSubmitted={() => setSubmittedCurrentQuestion(true)}
      />

      <div className="mt-12 flex justify-center">
        <GradientButton
          size="large"
          disabled={!submittedCurrentQuestion}
          onClick={handleNext}
        >
          {isLastQuestion ? 'Finish Interview' : 'Next Question'}
        </GradientButton>
      </div>
    </div>
  );
}
