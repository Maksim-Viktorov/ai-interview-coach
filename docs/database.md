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
- speech_metrics: jsonb, stores transcription and delivery metrics such as word count, duration, WPM, filler count, and filler feedback (payload from the client `speechMetrics` on submit — not the full Deepgram analytics object).
- delivery_scorecard: jsonb, four-dimension scorecard (`pace`, `fluency`, `cleanliness`, `dynamism`) from the client at submit when a voice answer was transcribed; null for typed-only answers.
- gaze_metrics: jsonb, summarized engagement snapshot (`eyeContactRatio`, `lookAwayEvents`, `longestLookAwayMs`, `totalFaceDetectedMs`, `hasSufficientData`) when the user opted into camera during recording; null if camera unavailable or declined.

Migrations live in `supabase/migrations/` (e.g. `20250115_add_delivery_scorecard.sql` for `delivery_scorecard`; `20250215_add_gaze_metrics.sql` for `gaze_metrics`).
