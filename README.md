# Rescue Remix (AI-Assisted Emergency Triage)

A modern emergency response command center that uses AI to triage emergency calls so human dispatchers can focus on the calls that matter most.

## Why this matters

Emergency systems are overloaded with accidental calls, non-emergency calls, and misuse.  
This project demonstrates how AI-assisted intake and live monitoring can reduce noise and improve operator response time for true emergencies.

## What this project does

- AI-assisted call intake using ElevenLabs conversational voice agents
- Real-time transcript capture and display for dispatcher workflows
- Dispatcher dashboard with recent call activity and incoming call handling
- Live monitor view for active conversations
- Admin analytics view for call trends and outcomes
- Supabase-backed auth and call history persistence

## Current app flow

1. User signs in (`/` or `/register`)
2. Dispatcher lands on dashboard (`/dashboard`)
3. Incoming call can be accepted (`/incoming` -> `/call`)
4. Live conversation messages stream and are stored
5. Supervisors can monitor conversations (`/monitor`)
6. Admins can review aggregate analytics (`/admin`)

## Tech stack

- Frontend: Next.js 16, React 19, TypeScript, CSS Modules
- Voice AI: ElevenLabs Conversational AI (`@elevenlabs/react`)
- Data/Auth: Supabase (`@supabase/supabase-js`)
- Charts: ECharts (`echarts`, `echarts-for-react`)
- Optional backend service: FastAPI + WebSocket + Supabase

## Project structure (high level)

```text
src/
  app/
    page.tsx                 # Login
    register/page.tsx        # Register
    dashboard/page.tsx       # Dispatcher workspace + incoming call modal
    incoming/page.tsx        # Incoming call screen
    call/page.tsx            # Live AI call + transcript
    monitor/page.tsx         # Supervisor monitor view
    admin/page.tsx           # Analytics dashboard
    api/
      signed-url/route.ts    # ElevenLabs signed URL
      conversations/route.ts # List conversations
      conversations/[id]/route.ts
  lib/supabase.ts            # Supabase client

backend/
  main.py                    # FastAPI app
  api/                       # Routes + websocket handlers
  db/                        # Supabase persistence helpers
```

## Prerequisites

- Node.js 18+
- npm (or pnpm/yarn)
- Supabase project
- ElevenLabs account with an agent configured
- Optional: Python 3.10+ (for `backend/`)

## Environment variables

Create `.env.local` in repo root for the Next.js app:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=your_elevenlabs_agent_id
ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

Create `backend/.env` for the FastAPI service (optional):

```bash
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
DISPATCHER_LANG=English
DISPATCHER_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

## Quick start

### 1) Frontend (main app)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 2) Optional backend service

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

Backend runs on [http://localhost:8000](http://localhost:8000).

## NPM scripts

- `npm run dev` - Start Next.js development server
- `npm run build` - Build production bundle
- `npm run start` - Run production server
- `npm run lint` - Run ESLint

## License

Private. All rights reserved.
