'use client';

import type { ReactNode } from 'react';

const FILLER_PHRASES = [
  'um',
  'uh',
  'like',
  'you know',
  'actually',
  'basically',
] as const;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightFillerWords(transcript: string): ReactNode {
  if (!transcript) return null;

  const phrases = [...FILLER_PHRASES].sort((a, b) => b.length - a.length);
  const union = phrases
    .map((phrase) => {
      const inner = phrase.split(/\s+/).map(escapeRegExp).join('\\s+');
      return `${inner}`;
    })
    .join('|');
  const re = new RegExp(`(\\b(?:${union})\\b)`, 'gi');

  const nodes: ReactNode[] = [];
  let key = 0;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(transcript)) !== null) {
    if (m.index > lastIndex) {
      nodes.push(
        <span key={`t-${key++}`}>{transcript.slice(lastIndex, m.index)}</span>,
      );
    }
    nodes.push(
      <span
        key={`f-${key++}`}
        className="bg-yellow-200 text-black px-1 rounded"
      >
        {m[1]}
      </span>,
    );
    lastIndex = m.index + m[1].length;
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
