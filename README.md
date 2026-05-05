# AI Interview Coach

A full-stack AI-powered interview coach that lets users practice behavioral interview questions with voice or text input, then receive structured feedback based on both response content and speaking patterns.

## Features

- **Voice recording** — Record answers in the browser; audio can be played back before or after processing.
- **Speech-to-text transcription** — Sends audio to OpenAI on the server and fills the answer field with the transcript.
- **Speech metrics** — Word count, duration, words per minute (WPM), pacing feedback, and filler-word detection.
- **AI-generated feedback** — After submit, responses are evaluated and returned as structured feedback (strengths, improvements, and suggestions).
- **Interview session flow** — Multi-step interview experience with persistent sessions and a guided completion flow.

## Tech Stack

- **Next.js** (App Router) with **React** and **TypeScript**
- **Supabase** — persistence for interview sessions and submitted answers
- **OpenAI** — audio transcription and answer feedback (server-side only)
- **Tailwind CSS** — styling

## How It Works

1. Create an interview session from the home page.
2. Answer each question using text or voice.
3. If using voice:
   - Audio is recorded in the browser
   - Sent to the server and transcribed
4. Speech metrics are computed and displayed.
5. Submit the answer to receive structured AI feedback.
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

### Environment variables

All OpenAI requests are performed server-side to ensure API keys are not exposed to the client.

Create a `.env.local` file in the project root with:

| Variable | Purpose |
| -------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (client and server helpers) |
| `OPENAI_API_KEY` | OpenAI API key (used only in API routes, never exposed to the client) |

You will need the matching **Supabase schema** (`interview_sessions`, `interview_answers`; see `docs/database.md`).

## Project Structure

- **`app/`** — App Router pages and API route handlers (`/api/sessions`, `/api/answers`, `/api/transcribe`, interview and home routes).
- **`components/`** — UI components, including the interview flow and answer form.
- **`lib/`** — Shared clients (e.g. Supabase and OpenAI) used from server code.

## Key Design Decisions

- Server-side AI calls — OpenAI requests are handled via API routes to keep API keys secure.
- Progressive interview flow — Users answer one question at a time to simulate real interview conditions.
- Voice-first input — Supports both text and audio, enabling more realistic interview practice.

## Motivation

This project explores how AI can be used not just for answering questions, but for improving communication skills through feedback on both content and delivery.

## Future Improvements

- **Coding interview mode** — Extend beyond behavioral Q&A (e.g. prompts, rubrics, or IDE-style tasks).
- **Advanced speech analytics** — Pause detection, timestamps, and richer pacing signals (toward real-time coaching).
- **Answer history and dashboard** — Review past sessions, trends, and progress over time.
