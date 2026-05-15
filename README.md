# AI Interview Coach

A full-stack AI-powered interview coach that lets users practice behavioral interview questions with voice or text input. Voice answers optionally use the webcam during recording for engagement-style metrics (eye contact, look-aways); delivery is scored with a four-dimension empirical scorecard driven by transcription timing metadata, filler patterns, and audio-derived pacing—all surfaced together with structured coach feedback after submission.

## Status

Active development. The Deepgram-backed speech analytics pipeline, four-dimension scorecard, and browser-side gaze/engagement path are wired into the main interview answer flow. **`/gaze-prototype`** remains available as an isolated MediaPipe sandbox for debugging thresholds and overlays.

## Features

- **Voice recording** — Record answers in the browser; audio can be played back before submit. Optionally grant webcam access **during** the same recording window for gaze-derived engagement metrics (`eye contact ratio`, look-away count, longest look-away). Denying camera falls back cleanly to audio-only.
- **Speech-to-text transcription** — Audio is sent to the server and transcribed with **Deepgram** (Nova-3), including utterances, word-level timings, filler-word detection, smart formatting, and `utt_split: 0.8`.
- **Speech metrics** — A **four-dimension delivery scorecard** (each 0–100, no aggregate). Thresholds are calibrated empirically rather than from generic published norms.
  - **Pace** — WPM against bands tuned to reference speakers (ideal roughly 180–230 WPM).
  - **Fluency** — Bell-curve rhythm from Local Rate Variation; rewards natural variation vs monotone or chaotic delivery.
  - **Cleanliness** — Filler density per 100 words uses the **same canonical phrase list** as the transcript highlighter (**`lib/filler-detection.ts`**: phrases such as um, uh, like, you know, actually, basically, so, right), so counted fillers match highlighted spans once results are revealed.
  - **Dynamism** — Peaks per minute on a sliding-window WPM curve.
- **Speaking pace chart** — Sliding-window WPM over time with an ideal-range reference band and x-axis ticks at even seconds (shown with the scorecard after submit when analytics exist).
- **AI-generated coach feedback** — After submit the server evaluates the answer with structured output (three cards: **Strength**, **Improvement**, **Suggestion**). The prompt cross-references **response content with delivery patterns**, taking both the transcript and the **four-dimension scorecard** as structured inputs when transcription analytics are available; typed-only submits use a narrower content-only prompt.
- **Interview session flow** — Multi-step interview experience with persistent sessions and a guided completion flow.
- **Engagement metrics (integrated)** — **`hooks/useGazeTracking.ts`** runs **MediaPipe Face Landmarker** (WASM via `@mediapipe/tasks-vision`) during recording while **`components/interview/camera-preview.tsx`** shows a mirrored self-view. Head pose plus dual-axis iris cues are compared against a **per-session baseline**, with blink masking (Eye Aspect Ratio) and asymmetric vertical thresholds. Aggregates render in **`components/interview/engagement-section.tsx`** after submit alongside Speech Analytics whenever camera data existed for that recording. Pure math helpers live in **`lib/gaze-detection.ts`**. A standalone experimental UI remains at **`/gaze-prototype`**.
- **Calibration tooling** — **`scripts/calibration/`**: batch reference recordings through the production analytics pipeline (`npm run calibrate`), then summarize per-metric distributions and Cohen's d separation between labeled groups (`npm run calibrate:analyse`).

## Tech Stack

- **Next.js** (App Router) with **React** and **TypeScript**
- **Supabase** — persistence for interview sessions and submitted answers
- **Deepgram** — server-side transcription (Nova-3) with utterances, timings, and filler metadata
- **OpenAI** — structured content feedback only (not transcription); server-side only
- **MediaPipe Face Landmarker** — browser-side gaze estimation (WASM bundle from `@mediapipe/tasks-vision`)
- **Recharts** — speaking pace (WPM) visualization
- **Tailwind CSS** — styling

## How It Works

1. Create an interview session from the home page.
2. Answer each question using text or voice.
3. If using voice, the browser records audio. Granting webcam permission additionally runs client-side gaze tracking for that recording (`useGazeTracking` + MediaPipe). Audio is uploaded and transcribed through a `/api/transcribe-deepgram` route backed by Deepgram (see source for the canonical path).
4. Returned transcript timings and filler metadata compute the empirical **four-dimension scorecard** and pace curve on the client; gaze aggregates finalize when recording stops (`getSnapshot`).
5. Submitting persists the finalized answer (`speech_metrics`, **`delivery_scorecard`**, **`gaze_metrics`** when captured) via `/api/answers`. Coach feedback is generated server-side—when analytics exist OpenAI consumes both the answer text **and** the structured scorecard; otherwise typed-only workflows fall back to a content-only prompt.
6. Speech Analytics (scorecard + pace chart), Engagement (camera path), filler-highlight transcript when voice analytics exist, and the three Coach Feedback cards **all render together after submit**—the plain textarea stays up until then, and a fresh recording clears prior results. Continue until all questions are completed.

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
| `OPENAI_API_KEY` | OpenAI API key for structured coach feedback (API routes only, not transcription) |

You will need the matching **Supabase schema** (`interview_sessions`, `interview_answers`; see **`docs/database.md`** for column notes including **`delivery_scorecard`** and **`gaze_metrics`** jsonb payloads).

## Project Structure

- **`app/`** — App Router pages and API route handlers (`/api/sessions`, `/api/answers`, `/api/transcribe-deepgram`, interview and home routes; gaze prototype at `/gaze-prototype`).
- **`components/`** — UI including the interview flow and answer form. Interview-specific pieces include **`components/interview/camera-preview.tsx`**, **`components/interview/engagement-section.tsx`**, pace chart, and highlighted transcript.
- **`hooks/`** — **`hooks/useGazeTracking.ts`** — MediaPipe Face Landmarker lifecycle, baseline sampling, and metric aggregation for the answer form.
- **`lib/`** — Supabase helpers, Deepgram integration, delivery analytics and dimension scoring (`DeepgramAnalytics`, scorecard types), **`lib/gaze-detection.ts`** (pure helpers: head pose from transform matrix, iris ratios, EAR), **`lib/filler-detection.ts`** (single filler vocabulary shared by cleanliness scoring + transcript spans), calibration reuse code.
- **`scripts/calibration/`** — Offline batch calibration (`run-calibration.ts`, `analyse-results.ts`) against reference audio using the production analytics pathway.

## Key Design Decisions

- **Empirical threshold calibration** — Scoring thresholds are tuned against a labeled corpus of reference recordings (strong, mediocre, weak) using Cohen's d separation analysis rather than published norms. Calibration scripts reuse production code paths so scripted numbers mirror live scoring.
- **Sliding window over fixed time buckets** — WPM-over-time uses overlapping word windows rather than fixed time buckets. Buckets introduce boundary artifacts when pauses straddle cuts; overlapping windows stabilize the curve irrespective of segmentation luck.
- **Four independent dimension scores, no aggregate** — A single delivery score averages away contradictory strengths. Pace, Fluency, Cleanliness, and Dynamism are stored separately (`delivery_scorecard`) and surfaced after submit alongside engagement summaries.
- **LLM coach feedback consumes delivery metrics** — `/api/answers` passes the structured scorecard into the OpenAI prompt when transcription analytics exist so narrative feedback can reference **both** content quality and delivery patterns; typed-only answers skip that branch. Gaze summaries are saved for history but are not injected into the LLM prompt.
- **Unified post-submit reveal** — Speech Analytics, Engagement, and Coach Feedback appear in one **results moment** after submission instead of progressively during transcription. That avoids pre-spoiling empirical metrics before the learner commits the answer.
- **Camera is optional** — Audio capture never depends on webcam permission. Missing or denied video simply omits engagement metrics while leaving the core coach loop intact.
- **Single source of truth for filler detection** — Cleanliness scoring and post-submit transcript highlighting read the same phrase list in **`lib/filler-detection.ts`**, preventing drift between scorecard counts and yellow spans.
- **Server-side AI calls** — OpenAI and Deepgram requests stay on API routes so secrets never ship to the browser bundle.
- **Per-user baseline for gaze detection** — Iris "center" varies with anatomy and camera geometry. Each recording recalibrates neutral iris position (~1 s of valid frames); deviations are judged relative to that baseline with blink filtering rather than forcing a frontal ideal.

## Motivation

Built to explore whether combined audio + webcam delivery analytics can augment interview rehearsal beyond what content-only critiques provide.

## Future Improvements

- **Question bank and session structure** — Currently questions are basic; build out a curated bank with category tags (technical, leadership, conflict) and multi-question orchestration UX.
- **Historical progress tracking** — Per-user trend view showing dimension scores (and eventual engagement aggregates) across practice sessions.
- **Cross-metric AI feedback refinement** — Coach feedback already leverages scorecard data; next refinement is structured checks for STAR coverage (explicit situation/task/action/result signals in the prose).
