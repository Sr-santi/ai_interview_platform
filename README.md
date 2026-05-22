# AI Interviewer Platform

Voice-driven AI-mediated job interview application. Candidates select a role, speak into their microphone, and the AI interviewer asks dynamic, role-grounded questions that adapt to their answers.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Database | SQLite (dev) / PostgreSQL via Supabase (prod) |
| ORM | Prisma |
| LLM | OpenRouter (OpenAI-compatible API) |
| STT | Web Speech API (SpeechRecognition) |
| TTS | Supertonic-3 (WebGPU) + Web Speech API fallback |
| Styling | Tailwind CSS v4 |

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env — add your OPENROUTER_API_KEY

# 3. Push database schema
npx prisma db push

# 4. Generate Prisma client
npx prisma generate

# 5. Seed sample jobs
npm run db:seed

# 6. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:seed` | Seed database with sample jobs |
| `npm run db:studio` | Open Prisma Studio (DB GUI) |

## Architecture

```
User speaks → Web Speech API (STT) → transcript text
  → Next.js Server Action (proxy) → OpenRouter LLM
  → structured JSON response → Server Action returns to client
  → TTS (Supertonic-3 / SpeechSynthesis) → audio playback
```

- **Server Actions** proxy all LLM calls — the `OPENROUTER_API_KEY` never reaches the browser
- **6 questions** per interview (4 core + 2 follow-ups)
- **Structured output** — LLM returns JSON with `thought_process`, `skills_detected`, `spoken_response`
- **Session persistence** — full transcript and evaluation saved to DB

## Database

Powered by Prisma ORM. Schema includes:

- **Job** — Role definitions with title, description, and LLM system prompt
- **Session** — Interview transcripts (JSON array of Q/A turns) and evaluations

```bash
# Inspect the database
npx prisma studio
```

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Database connection string |
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM inference |

## Deployment

Built for Vercel deployment with environment variables set in the dashboard. Swap `DATABASE_URL` from SQLite to PostgreSQL (Supabase) for production.
