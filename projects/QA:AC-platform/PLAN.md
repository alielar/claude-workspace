# QA Platform — Implementation Plan

**Overall Progress:** `100%`

---

## TLDR

A web-based QA platform that takes pitch PDFs, runs a back-and-forth completeness check via Claude API, then generates developer-ready Acceptance Criteria in Given/When/Then format. ACs are saved with full pitch history, downloadable as markdown or PDF, and pushable to Linear. A second feature tracks daily QA engineer performance via Linear integration.

---

## Critical Decisions

- **Framework:** Next.js 14 (App Router) — full-stack, handles API routes and file uploads in one codebase
- **Database:** Supabase (PostgreSQL + file storage) — hosted, no local setup, works for a small team
- **ORM:** Prisma — type-safe schema management (run `prisma generate` after DB setup)
- **AI:** Claude API (`claude-sonnet-4-6`) — intelligent AC generation from arbitrary pitches
- **UI:** Tailwind CSS + shadcn/ui — fast, consistent components
- **Linear:** Official `@linear/sdk` — push ACs as projects, track QA activity
- **PDF parsing:** `pdf-parse` v2 (`PDFParse` class) — extract raw text from uploaded pitches

---

## Tasks

- [x] 🟩 **Step 1: Project Setup**
  - [x] 🟩 Scaffold Next.js 14 app with App Router + TypeScript
  - [x] 🟩 Install and configure Tailwind CSS + shadcn/ui
  - [x] 🟩 Set up Supabase project (DB + storage bucket for PDFs)
  - [x] 🟩 Install Prisma, connect to Supabase, define schema
  - [x] 🟩 Add environment variables template (.env.local)

- [x] 🟩 **Step 2: Database Schema**
  - [x] 🟩 `pitches` table — id, title, pdf_url, raw_text, status, timestamps
  - [x] 🟩 `messages` table — id, pitch_id, role, content, created_at
  - [x] 🟩 `ac_documents` table — id, pitch_id, content_markdown, linear fields
  - [x] 🟩 `linear_config` table — api_key, default team/cycle

- [x] 🟩 **Step 3: PDF Upload + Text Extraction**
  - [x] 🟩 `POST /api/pitches` — upload PDF, extract text, store in Supabase Storage
  - [x] 🟩 `GET /api/pitches` — list all pitches
  - [x] 🟩 Drag-and-drop upload UI with status indicators

- [x] 🟩 **Step 4: Pitch Completeness Analysis**
  - [x] 🟩 `POST /api/pitches/[id]/analyze` — Claude evaluates completeness, returns JSON
  - [x] 🟩 Centralised prompts in `src/lib/prompts.ts`
  - [x] 🟩 Status lifecycle: UPLOADED → ANALYZING → CLARIFYING | COMPLETE

- [x] 🟩 **Step 5: Back-and-Forth Clarification Chat**
  - [x] 🟩 `POST /api/pitches/[id]/messages` — PM answers, Claude checks if gaps resolved
  - [x] 🟩 `GET /api/pitches/[id]/messages` — fetch conversation history
  - [x] 🟩 Chat UI with optimistic updates, Enter to send

- [x] 🟩 **Step 6: AC Generation (Streaming)**
  - [x] 🟩 `POST /api/pitches/[id]/generate-ac` — streams Claude response via SSE
  - [x] 🟩 `GET /api/pitches/[id]/generate-ac` — returns saved AC document
  - [x] 🟩 Saves full output to `ac_documents` on stream completion

- [x] 🟩 **Step 7: Pitch History Dashboard + AC View**
  - [x] 🟩 `/` — pitches list with status badges, drag-and-drop upload
  - [x] 🟩 `/pitches/[id]` — pitch detail: chat, generate button, AC output
  - [x] 🟩 Streaming AC rendered live as it arrives

- [x] 🟩 **Step 8: Download ACs**
  - [x] 🟩 `GET /api/pitches/[id]/download?format=md` — markdown download
  - [x] 🟩 `GET /api/pitches/[id]/download?format=pdf` — printable HTML (browser print-to-PDF)

- [x] 🟩 **Step 9: Linear Integration — Push ACs**
  - [x] 🟩 `POST /api/linear/push` — creates Linear project with AC content + Figma link
  - [x] 🟩 `GET/POST /api/linear/config` — store and validate Linear API key
  - [x] 🟩 `GET /api/linear/teams` — fetch teams and cycles for selectors
  - [x] 🟩 `LinearPushDialog` component — team/cycle/Figma selectors

- [x] 🟩 **Step 10: Linear QA Performance Dashboard**
  - [x] 🟩 `GET /api/linear/performance?teamId=xxx` — per-engineer metrics (last 30 days)
  - [x] 🟩 `/performance` — dashboard with progress bars per engineer

---

## Setup Instructions (run once)

```bash
# 1. Fill in .env.local with your Supabase and Anthropic credentials

# 2. Create a Supabase storage bucket called "pitches" (public)

# 3. Generate Prisma client and push schema to Supabase
npx prisma generate
npx prisma db push

# 4. Start the dev server
npm run dev
```

---

# QA Performance Dashboard — Implementation Plan

**Overall Progress:** `100%`

## TLDR
Dedicated QA dashboard scoped to Mahnoor & Iehtanab. Fetches all their Linear activity across Planning + Tech teams, classifies each issue as cycle_work or live_bug, and displays per-person summary metrics + daily activity logs with time filters.

## Critical Decisions
- **Hardcoded QA filter:** mahnoorismail8@gmail.com and iehtanab555@gmail.com only
- **Both teams:** Planning + Tech in edusogno workspace
- **Classification:** Project name regex first (Cycle \d+), then Claude Haiku for fallback
- **Cache:** JSON file at prisma/classification-cache.json — no re-classification on reload
- **New route:** /api/linear/qa-performance — old /api/linear/performance kept for future Tech dashboard

## Tasks

- [x] 🟩 **Step 1: Linear data fetching — QA-scoped**
- [x] 🟩 **Step 2: Classification engine**
- [x] 🟩 **Step 3: API response shape**
- [x] 🟩 **Step 4: QA Performance page — summary view**
- [x] 🟩 **Step 5: QA Performance page — daily activity log**
- [x] 🟩 **Step 6: Polish + edge cases**
