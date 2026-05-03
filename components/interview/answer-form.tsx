'use client';

import { useState } from 'react';

type AnswerFormProps = {
  question: string;
};

export function AnswerForm({ question }: AnswerFormProps) {
  const [answer, setAnswer] = useState('');

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

      <button
        type="button"
        className="mt-4 rounded bg-black px-4 py-2 text-white hover:bg-gray-800"
        onClick={() => console.log(question, answer)}
      >
        Submit Answer
      </button>
    </section>
  );
}
