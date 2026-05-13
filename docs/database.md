# Database

## Tables

### interview_sessions

Stores one mock interview session.

Columns:
- id: uuid primary key
- created_at: timestamp
- interview_type: text
- status: text

### interview_answers

Stores user answers for a session.

Columns:
- id: uuid primary key
- session_id: references interview_sessions(id)
- question: text
- answer: text
- feedback: text (JSON string of LLM fields: strength, improvement, suggestion)
- created_at: timestamps
- speech_metrics: jsonb, stores transcription and delivery metrics such as word count, duration, WPM, filler count, and filler feedback (payload from the client `speechMetrics` on submit — not the Deepgram analytics object).

### Deepgram dimension scorecard (not persisted)

The `/api/transcribe-deepgram` route returns a `coach` field: a four-dimension scorecard (`pace`, `fluency`, `cleanliness`, `dynamism`). That JSON is **not** written to Supabase. Older app versions that persisted a legacy coach shape under another key are not applicable here — `interview_answers` has no coach column; only `feedback` (LLM strength / improvement / suggestion JSON) and `speech_metrics` as above.