export type ParsedFeedback = {
  strength: string;
  improvement: string;
  suggestion: string;
};

export const FEEDBACK_PARSE_ERROR = 'parse_failed' as const;

export type FeedbackParseErrorPayload = {
  __error: typeof FEEDBACK_PARSE_ERROR;
  raw: string;
};

export function tryParseFeedback(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Continue to defensive strategies
  }

  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(stripped);
  } catch {
    // Try extracting first JSON object
  }

  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      // Fall through to null
    }
  }

  return null;
}

export function isFeedbackParseErrorPayload(
  value: unknown,
): value is FeedbackParseErrorPayload {
  return (
    value != null &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).__error === FEEDBACK_PARSE_ERROR
  );
}

export function normalizeParsedFeedback(raw: unknown): ParsedFeedback | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  if (isFeedbackParseErrorPayload(raw)) {
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const strength =
    typeof obj.strength === 'string' ? obj.strength : undefined;
  const improvement =
    typeof obj.improvement === 'string' ? obj.improvement : undefined;
  const suggestion =
    typeof obj.suggestion === 'string' ? obj.suggestion : undefined;

  if (strength == null && improvement == null && suggestion == null) {
    return null;
  }

  return {
    strength: strength ?? '',
    improvement: improvement ?? '',
    suggestion: suggestion ?? '',
  };
}

export function buildFeedbackStoragePayload(
  llmRawOutput: string,
): { feedbackPayload: string; parsed: ParsedFeedback | null } {
  const parsedUnknown = tryParseFeedback(llmRawOutput);
  const parsed = normalizeParsedFeedback(parsedUnknown);

  if (parsed === null) {
    return {
      feedbackPayload: JSON.stringify({
        __error: FEEDBACK_PARSE_ERROR,
        raw: llmRawOutput,
      } satisfies FeedbackParseErrorPayload),
      parsed: null,
    };
  }

  return {
    feedbackPayload: JSON.stringify(parsed),
    parsed,
  };
}
