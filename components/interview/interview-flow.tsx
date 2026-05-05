'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AnswerForm } from '@/components/interview/answer-form';
import { HighlightedTranscript } from '@/components/interview/highlighted-transcript';
import { parseSpeechMetrics, type SpeechMetrics } from '@/lib/speech-metrics';

export type RecentAnswer = {
  id: string;
  question: string;
  answer: string;
  feedback: string | null;
  speechMetrics?: SpeechMetrics | null;
};

type ParsedFeedbackDisplay =
  | { kind: 'structured'; strength: string; improvement: string; suggestion: string }
  | { kind: 'raw'; text: string }
  | { kind: 'none' };

function parseFeedbackDisplay(raw: string | null): ParsedFeedbackDisplay {
  if (raw == null || raw.trim() === '') return { kind: 'none' };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { kind: 'raw', text: raw };
    }
    const obj = parsed as Record<string, unknown>;
    const strength =
      typeof obj.strength === 'string' ? obj.strength : undefined;
    const improvement =
      typeof obj.improvement === 'string' ? obj.improvement : undefined;
    const suggestion =
      typeof obj.suggestion === 'string' ? obj.suggestion : undefined;
    if (strength == null && improvement == null && suggestion == null) {
      return { kind: 'raw', text: raw };
    }
    return {
      kind: 'structured',
      strength: strength ?? '',
      improvement: improvement ?? '',
      suggestion: suggestion ?? '',
    };
  } catch {
    return { kind: 'raw', text: raw };
  }
}

type InterviewFlowProps = {
  sessionId: string;
  questions: string[];
  recentAnswers?: RecentAnswer[];
};

export function InterviewFlow({
  sessionId,
  questions,
  recentAnswers = [],
}: InterviewFlowProps) {
  const router = useRouter();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [submittedCurrentQuestion, setSubmittedCurrentQuestion] =
    useState(false);
  const didRefreshOnComplete = useRef(false);

  useEffect(() => {
    if (
      questions.length > 0 &&
      currentQuestionIndex >= questions.length &&
      !didRefreshOnComplete.current
    ) {
      didRefreshOnComplete.current = true;
      router.refresh();
    }
  }, [currentQuestionIndex, questions.length, router]);

  if (questions.length === 0) {
    return null;
  }

  if (currentQuestionIndex >= questions.length) {
    return (
      <div className="space-y-6" role="status">
        <div>
          <p className="text-2xl font-semibold">Interview complete</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            You answered all questions.
          </p>
        </div>

        {recentAnswers.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Recent answers</h2>
            <ul className="space-y-3">
              {recentAnswers.map((item) => {
                const fb = parseFeedbackDisplay(item.feedback);
                const metrics =
                  item.speechMetrics != null
                    ? parseSpeechMetrics(item.speechMetrics)
                    : null;
                const hasStructured =
                  fb.kind === 'structured' &&
                  (fb.strength || fb.improvement || fb.suggestion);
                return (
                  <li
                    key={item.id}
                    className="rounded border p-4 space-y-2 text-sm"
                  >
                    <p className="font-semibold text-balance">{item.question}</p>
                    <div className="line-clamp-5 overflow-hidden text-left">
                      <HighlightedTranscript text={item.answer} />
                    </div>
                    {metrics ? (
                      <div className="mt-2 space-y-1 border-t border-current/15 pt-2 text-xs text-gray-600 dark:text-gray-400">
                        <p className="tabular-nums">
                          Words {metrics.wordCount}
                          <span className="mx-1.5 opacity-60">·</span>
                          {Math.round(metrics.durationSeconds)}s
                          <span className="mx-1.5 opacity-60">·</span>
                          WPM {metrics.wordsPerMinute}
                          <span className="mx-1.5 opacity-60">·</span>
                          Fillers {metrics.fillerCount}
                        </p>
                        {metrics.paceFeedback ? (
                          <p className="leading-snug">{metrics.paceFeedback}</p>
                        ) : null}
                        {metrics.fillerFeedback ? (
                          <p className="leading-snug">{metrics.fillerFeedback}</p>
                        ) : null}
                      </div>
                    ) : null}
                    {hasStructured ? (
                      <div className="pt-3 mt-1 space-y-3 border-t border-current/20">
                        {fb.strength ? (
                          <div className="space-y-1.5">
                            <p className="font-semibold text-sm tracking-tight">
                              Strength
                            </p>
                            <p className="whitespace-pre-wrap pl-0 leading-relaxed">
                              {fb.strength}
                            </p>
                          </div>
                        ) : null}
                        {fb.improvement ? (
                          <div className="space-y-1.5">
                            <p className="font-semibold text-sm tracking-tight">
                              Improvement
                            </p>
                            <p className="whitespace-pre-wrap pl-0 leading-relaxed">
                              {fb.improvement}
                            </p>
                          </div>
                        ) : null}
                        {fb.suggestion ? (
                          <div className="space-y-1.5">
                            <p className="font-semibold text-sm tracking-tight">
                              Suggestion
                            </p>
                            <p className="whitespace-pre-wrap pl-0 leading-relaxed">
                              {fb.suggestion}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : fb.kind === 'raw' ? (
                      <div className="pt-3 mt-1 space-y-1.5 border-t border-current/20">
                        <p className="font-semibold text-sm tracking-tight">
                          Feedback
                        </p>
                        <p className="whitespace-pre-wrap break-words leading-relaxed">
                          {fb.text}
                        </p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded bg-white px-4 py-2 text-black hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-200"
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
      <p className="text-sm text-gray-600 dark:text-gray-400">
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
        className="rounded bg-white px-4 py-2 text-black hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-200"
        disabled={!submittedCurrentQuestion}
        onClick={handleNext}
      >
        {isLastQuestion ? 'Finish interview' : 'Next Question'}
      </button>
    </div>
  );
}
