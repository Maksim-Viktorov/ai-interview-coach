'use client';

import type { ReactNode } from 'react';
import { findFillerRanges } from '@/lib/filler-detection';

function highlightFillerWords(transcript: string): ReactNode {
  if (!transcript) return null;

  const ranges = findFillerRanges(transcript);
  if (ranges.length === 0) {
    return transcript;
  }

  const nodes: ReactNode[] = [];
  let key = 0;
  let lastIndex = 0;

  for (const range of ranges) {
    if (range.start > lastIndex) {
      nodes.push(
        <span key={`t-${key++}`}>
          {transcript.slice(lastIndex, range.start)}
        </span>,
      );
    }
    nodes.push(
      <span
        key={`f-${key++}`}
        className="bg-yellow-200 text-black px-1 rounded"
      >
        {range.text}
      </span>,
    );
    lastIndex = range.end;
  }

  if (lastIndex < transcript.length) {
    nodes.push(
      <span key={`t-${key++}`}>{transcript.slice(lastIndex)}</span>,
    );
  }

  return nodes.length > 0 ? nodes : transcript;
}

type HighlightedTranscriptProps = {
  text: string;
};

export function HighlightedTranscript({ text }: HighlightedTranscriptProps) {
  return (
    <div className="whitespace-pre-wrap">{highlightFillerWords(text)}</div>
  );
}
