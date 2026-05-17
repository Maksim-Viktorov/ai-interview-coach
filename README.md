# AI Interview Coach

A full-stack AI interview coach for behavioral interview practice. Users sign in, complete three-question voice sessions with optional webcam engagement tracking, and receive a four-dimension delivery scorecard, pace visualization, and structured LLM coaching feedback that cross-references what they said with how they delivered it. Session history and aggregate stats are available per user. The UI uses a cohesive light-theme design system across home, interview, summary, stats, and login pages.

## Features

- **Voice-first practice** — Audio recording is required for submission. The server rejects answers without valid delivery analytics. Users may edit the auto-generated transcript before submit; delivery metrics are computed from the recorded audio, while coach feedback evaluates the submitted text.
- **Four-dimension delivery scorecard** — Pace, Fluency, Cleanliness, and Dynamism (each 0–100, no aggregate). Thresholds are calibrated empirically rather than from generic published norms.
  - **Pace** — WPM against bands tuned to reference speakers (ideal roughly 180–230 WPM).
  - **Fluency** — Bell-curve rhythm from Local Rate Variation; rewards natural variation vs monotone or chaotic delivery.
  - **Cleanliness** — Filler density per 100 words uses the same canonical phrase list as the transcript highlighter (`lib/filler-detection.ts`).
  - **Dynamism** — Peaks per minute on a sliding-window WPM curve.
- **Speaking pace chart** — Sliding-window WPM over time with an ideal-range reference band (Recharts), shown per answer after submit and on the session summary.
- **Real-time gaze tracking** — Optional webcam during recording via MediaPipe Face Landmarker (`hooks/useGazeTracking.ts`, `lib/gaze-detection.ts`). Eye contact ratio, look-away events, and related aggregates render in the engagement section when sufficient face data exists.
- **LLM coaching feedback** — After submit, OpenAI returns structured JSON (Strength, Improvement, Suggestion). The prompt includes both the transcript and the scorecard. Defensive parsing handles markdown-wrapped or prose-wrapped JSON; a user-initiated **Regenerate Feedback** flow (up to three attempts per view) recovers rare parse failures.
- **Multi-question sessions** — Each session has three questions drawn at random from the database bank, with category variety (one question per category among three distinct categories). Users advance through questions in the interview flow and land on a dedicated summary page when all three are complete.
- **Session summary** — `/interview/[id]/summary` shows per-question results: highlighted transcript, speech analytics, pace chart, engagement, and coach feedback.
- **Stats and history** — `/stats` shows aggregate metrics (sessions, answers, average Pace, average Engagement) and a list of past sessions linking to summary (complete) or resume (in progress).
- **Authentication** — Supabase Auth (email/password). Row Level Security isolates sessions and answers per user. Middleware redirects unauthenticated visitors to `/login`.
- **Question bank** — Thirty seeded behavioral questions across six categories (technical, leadership, conflict, failure, ambiguity, background) in Supabase; sessions reference three question IDs at creation time.
- **Calibration tooling** — `scripts/calibration/`: batch reference recordings through the production analytics pipeline (`npm run calibrate`), then summarize distributions and Cohen's d separation (`npm run calibrate:analyse`).

## Tech Stack

- **Next.js** (App Router) with **React** and **TypeScript**
- **Supabase** — Postgres persistence, Auth, and Row Level Security (`@supabase/ssr` for cookie-based sessions)
- **Deepgram** — server-side transcription (Nova-3) with utterances, timings, and filler metadata
- **OpenAI** — `gpt-5.4-mini` for structured coach feedback (server-side only)
- **MediaPipe Face Landmarker** — browser-side gaze estimation (`@mediapipe/tasks-vision`)
- **Recharts** — speaking pace (WPM) visualization
- **Tailwind CSS v4** — CSS-first styling with `@theme` design tokens in `app/globals.css`

## How It Works

1. The user signs up or logs in at `/login` (email/password via Supabase Auth).
2. From the home page, **Start Interview** calls `POST /api/sessions`, which picks three random questions (one per category among three different categories), stores their IDs on the session row, and redirects to `/interview/[id]`.
3. For each question, the user records a voice answer. Granting webcam permission runs gaze tracking during the same recording window. Stopping the recording auto-transcribes via `/api/transcribe-deepgram`; the user can edit the transcript before submit.
4. On submit, `POST /api/answers` requires valid `delivery_scorecard` and `delivery_analytics` (audio path). The server upserts the answer on `(session_id, question_id)`, generates LLM feedback from the transcript plus scorecard, and returns results to the client.
5. The client shows post-submit results for that question: highlighted transcript, speech analytics (WPM headline and four dimension cards), speaking pace over time, engagement (if camera data exists), and coach feedback (or regenerate UI on parse failure).
6. The user advances to the next question; re-recording the same question replaces the prior attempt (upsert, not duplicate rows).
7. After the third question, navigation goes to `/interview/[id]/summary` with all three Q&A pairs and the same per-question result sections.
8. **View Stats** on the home page opens `/stats` for aggregate metrics and past session links.

## Getting Started

### Install dependencies

```bash
npm install
```

### Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Unauthenticated requests are redirected to `/login`.

To run the calibration tooling on reference recordings, see **`scripts/calibration/`** (`npm run calibrate`, `npm run calibrate:analyse`).

### Environment variables

All third-party API requests are performed server-side so API keys are not exposed to the client.

Create a `.env.local` file in the project root with:

| Variable | Purpose |
| -------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (client and server helpers) |
| `DEEPGRAM_API_KEY` | Deepgram API key for transcription (API routes only) |
| `OPENAI_API_KEY` | OpenAI API key for structured coach feedback (API routes only) |

Apply Supabase migrations under **`supabase/migrations/`** and seed the `questions` table before creating sessions. See **`docs/database.md`** for table and column notes (`interview_sessions`, `interview_answers`, `questions`, RLS policies).

## Project Structure

### App routes

- `app/page.tsx` — Home (hero, Start Interview, View Stats)
- `app/login/page.tsx` — Login and sign-up
- `app/stats/page.tsx` — Aggregate stats and session list
- `app/interview/[id]/page.tsx` — Three-question interview flow
- `app/interview/[id]/summary/page.tsx` — Completed session review
- `app/layout.tsx`, `app/globals.css` — Root layout and design tokens
- `middleware.ts` — Auth gate and session refresh

### API routes

- `app/api/sessions/route.ts` — Create session with three random question IDs
- `app/api/answers/route.ts` — Submit answer, scorecard, analytics, gaze metrics, LLM feedback
- `app/api/answers/[id]/regenerate-feedback/route.ts` — Re-run LLM feedback for an existing answer
- `app/api/transcribe-deepgram/route.ts` — Audio transcription and client-side scorecard inputs

### Libraries

- `lib/design-tokens.ts` — Shared colors for Recharts and non-Tailwind use
- `lib/deepgram-analytics.ts`, `lib/dimension-scoring.ts`, `lib/filler-detection.ts` — Delivery analytics and scorecard
- `lib/feedback-llm.ts`, `lib/feedback-parse.ts` — LLM prompt, generation, and defensive JSON parsing
- `lib/gaze-detection.ts` — Pure gaze math helpers
- `lib/stats-aggregation.ts` — Stats page aggregates and session rows
- `lib/session-summary.ts` — Summary page pairing and validation helpers
- `lib/auth-api.ts`, `lib/supabase-server.ts`, `lib/supabase-browser.ts`, `lib/supabase-middleware.ts` — Supabase clients and auth helpers
- `lib/openai.ts`, `lib/deepgram-client.ts` — API clients

### Hooks and components

- `hooks/useGazeTracking.ts` — MediaPipe lifecycle and gaze aggregates
- `components/auth/header.tsx` — Authenticated app header
- `components/ui/gradient-button.tsx`, `components/ui/outline-button.tsx` — Primary and secondary actions
- `components/interview/interview-flow.tsx` — Question progression and progress UI
- `components/interview/answer-form.tsx` — Recording, transcript, submit, post-submit results
- `components/interview/coach-ui.tsx` — Scorecards, coach feedback, regenerate UI
- `components/interview/speech-analytics-section.tsx`, `speaking-pace-over-time-section.tsx`, `speaking-pace-over-time-chart.tsx`
- `components/interview/engagement-section.tsx`, `camera-preview.tsx`, `highlighted-transcript.tsx`
- `components/interview/session-summary.tsx` — Summary page layout
- `components/stats/stats-overview.tsx`, `components/stats/session-list.tsx`

### Database

- `supabase/migrations/` — Schema, RLS, unique `(session_id, question_id)`, delivery analytics column

### Offline tooling

- `scripts/calibration/` — Reference recording batch analysis

## Key Design Decisions

- **Empirical threshold calibration** — Scoring thresholds are tuned against labeled reference recordings using Cohen's d separation rather than published norms. Calibration scripts reuse production code paths.
- **Sliding window over fixed time buckets** — WPM-over-time uses overlapping word windows to avoid pause-boundary artifacts.
- **Four independent dimension scores, no aggregate** — Pace, Fluency, Cleanliness, and Dynamism are stored separately in `delivery_scorecard` and surfaced independently.
- **Audio-required submission** — The server returns 400 when analytics or scorecard are missing. The product targets voice delivery coaching, not typed-only answers.
- **Upsert by (session_id, question_id)** — Re-recording replaces the previous attempt for that question in the same session; a unique constraint enforces one row per pair.
- **Per-user data isolation via RLS** — Supabase policies scope `interview_sessions` and `interview_answers` to `auth.uid()`. The shared `questions` bank is readable by any authenticated user.
- **Audio analytics from recording, LLM feedback from submitted transcript** — Users may fix mistranscriptions in the textarea; delivery metrics reflect the audio, content feedback reflects the text they submit.
- **Defensive JSON parsing for LLM output** — Strips markdown fences and extracts JSON objects from prose before persisting. Parse failures store a structured error marker; the client offers regenerate with a three-attempt cap per view (client-side only).
- **LLM coach feedback consumes delivery metrics** — The OpenAI prompt includes the scorecard when analytics exist. Gaze summaries are persisted for history but are not injected into the LLM prompt.
- **Unified post-submit reveal** — Results sections appear after submission for each question rather than during transcription.
- **Camera is optional** — Denied or missing webcam omits engagement metrics without blocking audio practice.
- **Single source of truth for filler detection** — `lib/filler-detection.ts` backs both Cleanliness scoring and transcript highlighting.
- **Server-side AI calls** — OpenAI and Deepgram run on API routes so secrets stay off the client.
- **Per-user baseline for gaze detection** — Iris position is calibrated per recording; deviations are judged relative to that baseline with blink filtering.
- **Light theme with custom design system** — Brand indigo (`#524FFC`), blue→purple gradient CTAs, Poppins for display type, Inter for body. Tailwind v4 `@theme` tokens in `app/globals.css` and `lib/design-tokens.ts` for charts.

## Motivation

Built to explore whether combined audio and webcam delivery analytics can augment interview rehearsal beyond content-only critique, with a product surface that supports repeat practice, history, and per-session review.

## Future Improvements

- Per-dimension stats trends over time (charts for Pace, Fluency, Cleanliness, Dynamism across sessions)
- Per-category breakdowns (e.g. delivery patterns on conflict vs leadership questions)
- Question bank expansion and user-suggested questions
- Per-session category selection (e.g. a session of only leadership questions)
- Session deletion and other session management actions
- OAuth sign-in (Google, GitHub)
- Pagination on the stats session list
