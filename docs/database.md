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
- created_at: timestamps
- speech_metrics: jsonb, stores transcription and delivery metrics such as word count, duration, WPM, filler count, and filler feedback