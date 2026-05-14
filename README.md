# AI Interview Coach

A full-stack AI-powered interview coach that lets users practice behavioral interview questions with voice or text input, then receive structured feedback on response content and a four-dimension delivery scorecard computed from the transcript and audio timing.

## Status

Active development. The speech analytics pipeline and four-dimension scorecard are shipped. The gaze detection prototype works as a standalone page (/gaze-prototype) and is the next feature to integrate into the main flow.

## Features

- **Voice recording** — Record answers in the browser; audio can be played back before or after processing.
- **Speech-to-text transcription** — Audio is sent to the server and transcribed with **Deepgram** (Nova-3), including utterances, word-level timings, filler-word detection, smart formatting, and `utt_split: 0.8`.
- **Speech metrics** — A **four-dimension delivery scorecard** (each 0–100, no aggregate). Thresholds are calibrated empirically rather than from generic published norms.
  - **Pace** — WPM against bands tuned to reference speakers (ideal roughly 180–230 WPM).
  - **Fluency** — Bell-curve rhythm from Local Rate Variation; rewards natural variation vs monotone or chaotic delivery.
  - **Cleanliness** — Filler density per 100 words.
  - **Dynamism** — Peaks per minute on a sliding-window WPM curve.
- **Speaking pace chart** — Sliding-window WPM over time with an ideal-range reference band and x-axis ticks at even seconds.
- **AI-generated feedback** — After submit, responses are evaluated server-side and returned as three cards (**Strength**, **Improvement**, **Suggestion**) styled to match the analytics scorecard.
- **Interview session flow** — Multi-step interview experience with persistent sessions and a guided completion flow.
- **Gaze detection (prototype)** — **`/gaze-prototype`**: browser-side **MediaPipe Face Landmarker** (WASM) for real-time head pose and dual-axis iris tracking, with per-user baseline calibration, blink filtering (Eye Aspect Ratio), and asymmetric vertical thresholds. Not wired into the main interview flow.
- **Calibration tooling** — **`scripts/calibration/`**: batch reference recordings through the production analytics pipeline (`npm run calibrate`), then summarize per-metric distributions and Cohen's d separation between labeled groups (`npm run calibrate:analyse`).

## Tech Stack

- **Next.js** (App Router) with **React** and **TypeScript**
- **Supabase** — persistence for interview sessions and submitted answers
- **Deepgram** — server-side transcription (Nova-3) with utterances, timings, and filler metadata
- **OpenAI** — structured content feedback only (not transcription); server-side only
- **MediaPipe Face Landmarker** — gaze prototype (browser, WASM bundle from `@mediapipe/tasks-vision`)
- **Recharts** — speaking pace (WPM) visualization
- **Tailwind CSS** — styling

## How It Works

1. Create an interview session from the home page.
2. Answer each question using text or voice.
3. If using voice:
   - Audio is recorded in the browser
   - Sent to the server and transcribed via **Deepgram** (API route)
4. Transcript and timing metadata feed the **four-dimension scorecard** and pace chart; metrics are computed and displayed before submit.
5. Submit the answer to receive structured AI feedback on content.
6. Continue until all questions are completed.

## Getting Started

### Install dependencies

```bash
npm install
```

### Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

To run the calibration tooling on your own reference recordings, see **`scripts/calibration/`** (`npm run calibrate`, `npm run calibrate:analyse`).

### Environment variables

All third-party API requests are performed server-side to ensure API keys are not exposed to the client.

Create a `.env.local` file in the project root with:

| Variable | Purpose |
| -------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (client and server helpers) |
| `DEEPGRAM_API_KEY` | Deepgram API key for transcription (API routes only) |
| `OPENAI_API_KEY` | OpenAI API key for content feedback only (API routes only, not used for transcription) |

You will need the matching **Supabase schema** (`interview_sessions`, `interview_answers`; see `docs/database.md`).

## Project Structure

- **`app/`** — App Router pages and API route handlers (`/api/sessions`, `/api/answers`, `/api/transcribe-deepgram`, interview and home routes; gaze prototype at `/gaze-prototype`).
- **`components/`** — UI components, including the interview flow and answer form.
- **`lib/`** — Supabase helpers, Deepgram integration, delivery analytics and dimension scoring (`DeepgramAnalytics`, scorecard types), and shared logic reused by calibration scripts.
- **`scripts/calibration/`** — Offline batch calibration (`run-calibration.ts`, `analyse-results.ts`) against reference audio; uses the same production analytics code path as the app.

## Key Design Decisions

- **Empirical threshold calibration** — Scoring thresholds are tuned against a labeled corpus of reference recordings (strong, mediocre, weak) using Cohen's d separation analysis rather than published norms. The calibration script reuses production code, so calibration numbers match what users see.
- **Sliding window over fixed time buckets** — WPM-over-time uses overlapping word windows rather than fixed time buckets. Buckets created boundary artifacts where pauses landed near edges; windows produce smoother curves independent of where buckets fall.
- **Four independent dimension scores, no aggregate** — A single "delivery score" would average away meaningful weaknesses. Separate Pace, Fluency, Cleanliness, and Dynamism scores let users see exactly where they're strong vs weak.
- **Server-side AI calls** — OpenAI and Deepgram requests are handled via API routes to keep API keys secure.
- **Per-user baseline for gaze detection** — Iris-position-as-"centered" varies per person and camera angle. The prototype calibrates the user's neutral iris position during the first ~1 second of face detection and computes deviations from that baseline rather than assuming an idealized center.

## Motivation

Built to explore whether webcam-based delivery analytics can offer interview feedback that content-only tools don't capture.

## Future Improvements

- **Gaze detection integration** — Wire the existing `/gaze-prototype` page into the main interview flow with eye-contact ratio displayed alongside the speech scorecard.
- **Question bank and session structure** — Currently questions are basic; build out a curated bank with category tags (technical, leadership, conflict) and multi-question session flow.
- **Historical progress tracking** — Per-user trend view showing dimension scores over time so users can see improvement across practice sessions.
- **AI feedback that uses metric data** — Pass the scorecard into the LLM prompt so feedback can cross-reference content quality against delivery patterns.
