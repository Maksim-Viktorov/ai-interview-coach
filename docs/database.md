# Database

**Access control:** Row Level Security (RLS) is **disabled** on all application tables. The project relies on the Supabase **service role** / server client for reads and writes rather than per-table RLS policies. Re-enable RLS only if you introduce authenticated users and policy-based rules.

## Tables

### questions

Canonical question bank. **Question text lives here** (`text`); sessions store references by UUID, not embedded strings.

Columns (conceptual): `id` (uuid primary key), `text` (prompt shown to the user), `category` (used when building a session to prefer variety across categories; not shown in the UI yet).

### interview_sessions

Stores one mock interview session.

Columns:
- id: uuid primary key
- created_at: timestamp
- interview_type: text
- status: text
- **question_ids: uuid[]** — Three FKs into `questions.id`, assigned when the session is created (`POST /api/sessions`). Order defines interview order (Q1 → Q3). Length is always **3** for sessions created by the app.

### interview_answers

Stores user answers for a session.

Columns:
- id: uuid primary key
- session_id: references interview_sessions(id)
- question: text — snapshot of the prompt shown at submit time (denormalized for history even if the bank is edited later)
- **question_id: uuid (nullable)** — FK to `questions.id` identifying which bank row was answered; null only in edge cases or legacy rows
- answer: text
- feedback: text (JSON string of LLM fields: strength, improvement, suggestion)
- created_at: timestamps
- speech_metrics: jsonb, stores transcription and delivery metrics such as word count, duration, WPM, filler count, and filler feedback (payload from the client `speechMetrics` on submit — not the full Deepgram analytics object).
- delivery_scorecard: jsonb, four-dimension scorecard (`pace`, `fluency`, `cleanliness`, `dynamism`) from the client at submit when a voice answer was transcribed; null for typed-only answers.
- gaze_metrics: jsonb, summarized engagement snapshot (`eyeContactRatio`, `lookAwayEvents`, `longestLookAwayMs`, `totalFaceDetectedMs`, `hasSufficientData`) when the user opted into camera during recording; null if camera unavailable or declined.

Migrations live in `supabase/migrations/` (e.g. `20250115_add_delivery_scorecard.sql` for `delivery_scorecard`; `20250215_add_gaze_metrics.sql` for `gaze_metrics`).
