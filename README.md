# StudyPilot — AI Personalized Study Assistant

A hackathon-ready MVP starter built with Next.js 15, TypeScript, Supabase PostgreSQL/Storage/Auth/pgvector and Google Gemini. It supports student uploads, document indexing, a source-grounded tutor, diagnostic quizzes with server-side answer keys, topic performance and revision planning.

## Features

- Email/password signup and login using Supabase Auth.
- Private original-file uploads to Supabase Storage.
- PDF.js text extraction with Tesseract.js OCR fallback for low-text PDF pages; TXT and Markdown supported.
- Page-aware chunking and resumable embedding generation in small batches.
- Gemini embeddings stored in Supabase pgvector.
- Topic hierarchy generated from documents categorized as syllabus.
- RAG tutor with vector retrieval and source citation metadata.
- Quiz questions grounded in retrieved chunks; correct answers stay server-side until submission.
- Deterministic answer scoring and topic-level performance classification.
- Rule-based revision planner using topic performance and daily study-time input.
- Persistent chat sessions, quiz attempts and student records.

## Requirements

- Node.js 20 or newer
- Supabase project with Auth, Storage and PostgreSQL
- Google AI Studio API key
- A Gemini generation model available to your API key

## 1. Install

```bash
npm install
cp .env.example .env.local
```

Populate `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_GENERATION_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIMENSIONS=768
NEXT_PUBLIC_APP_URL=http://localhost:3000
DEMO_EMAIL=demo@student.local
DEMO_PASSWORD=SET_A_STRONG_PASSWORD
DEMO_NAME=Demo Student
```

Never commit `.env.local`. Never add the service-role key to a `NEXT_PUBLIC_` variable or import the admin client into a Client Component.

## 2. Configure Supabase

1. Create a Supabase project.
2. Open SQL Editor.
3. On a new database, run `supabase/migrations/001_initial.sql`. If you already ran the earlier starter migration from the first project ZIP, run `supabase/migrations/002_upgrade_existing.sql` instead.
4. In Authentication settings, enable email/password sign-in. For quick hackathon signup, configure email confirmation according to your chosen demo approach.
5. Verify the private `study-materials` bucket was created by the migration.
6. Copy the project URL and anon/publishable key into `.env.local`.

The migration corrects the profiles policy (`profiles.id`) separately from the student tables (`user_id`). The `quiz_questions` table has RLS enabled but no browser-user policy: the answer key is accessed by server-side API routes through the service role after checking the authenticated owner.

## 3. Create a demo account

Install dependencies first, then run from your local terminal:

```bash
npx tsx --env-file=.env.local scripts/create-demo-user.ts
```

The script is idempotent: it creates or updates the configured demo user. Share demo credentials only with intended evaluators; do not commit passwords.

## 4. Run locally

```bash
npm run dev
```

Visit http://localhost:3000, create a student account, or sign in with the demo account.

## 5. Document ingestion and resumable indexing

1. The browser extracts selectable PDF text with PDF.js. If a page has very little extractable text, Tesseract.js attempts OCR.
2. The original file is uploaded directly to the private Supabase Storage bucket under `<auth-user-id>/<uuid>/<filename>`.
3. `POST /api/materials` records material metadata and inserts text chunks with null embeddings.
4. The browser calls `POST /api/materials/process` repeatedly. Each request embeds at most 3 chunks and persists each vector immediately.
5. The endpoint counts successfully embedded chunks. Once all chunks are indexed, it marks the material complete and generates topics only for a material categorized as `syllabus`.
6. A failed batch can be resumed from the Materials page. Already-indexed chunks are not regenerated because only null embedding rows are selected.

The default UI caps uploads at 10 MB and 50 PDF pages. OCR can be slow and browser memory use depends on page size. Very large or low-quality scans should be split before upload.

## 6. RAG architecture

- **Embedding:** `src/lib/rag/embeddings.ts` calls Gemini with `RETRIEVAL_DOCUMENT` for stored passages and `RETRIEVAL_QUERY` for user queries.
- **Retrieval:** `src/lib/rag/retrieve.ts` embeds the question and calls `match_document_chunks` in Supabase.
- **Authorization:** the vector RPC is `SECURITY INVOKER` and filters by `auth.uid()` as well as optional selected material IDs.
- **Context assembly and generation:** `src/lib/rag/answer.ts` builds a prompt from retrieved passages and sends it to Gemini. The instruction explicitly restricts answers to those passages.
- **Citations:** source metadata is assembled from the actual retrieved rows. Returned citations include chunk ID, document, page and section. Citation markers in the generated text are checked against the retrieved tag set.

Retrieval and generation are separate modules. Retrieval selects evidence; generation synthesizes an answer from that evidence. The model can still make mistakes, so the app returns source references and an insufficient-evidence response when no passage meets the similarity threshold.

## 7. Quiz security and evaluation

- Quiz generation performs topic-aware retrieval from the selected material.
- Generated questions are validated against supplied chunk IDs and their options.
- Question text/options/citations are returned to the browser; correct answers and explanations are stored in `quiz_questions`.
- The answer-key table has no authenticated-user RLS policy. API routes use the server-only admin client after validating the student's auth session and ownership.
- Submission accepts question IDs and selected options only. The server reads the answer key, validates submitted options, scores responses, and then returns feedback and source citations.

## 8. Deployment to GitHub and Vercel

### GitHub

```bash
git init
git add .
git commit -m "Build StudyPilot AI study assistant"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ai-personalized-study-assistant.git
git push -u origin main
```

### Vercel

1. Import the GitHub repository into Vercel.
2. Add every required environment variable from `.env.example` to Vercel Project Settings.
3. Set `NEXT_PUBLIC_APP_URL` to your Vercel production URL.
4. Add your production URL to Supabase Auth URL Configuration and configure the appropriate redirect URLs.
5. Deploy and test a new signup, login, file upload, OCR fallback, indexing, tutor query, quiz submission and revision-plan save.
6. Do not claim deployment success until the live URL has been opened and the workflow has been tested.

`vercel.json` selects the Mumbai region (`bom1`) for proximity to the expected India demo audience; change it if your Supabase project or evaluators are elsewhere.

## 9. Quality checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Current MVP boundaries

- Tesseract OCR is a browser-side fallback and relies on OCR language data downloads; quality depends on scan resolution and language packs.
- The material ingestion API accepts extracted page text in one request and caps it at 500,000 characters. Embedding itself is resumable. For larger documents, implement chunk-upload pagination or a background queue.
- The topic outline is produced by a model from a bounded sample of indexed chunks; manually review the generated hierarchy for academic accuracy.
- Quiz question quality depends on the retrieved passages and generation model. Validate the result set before graded/high-stakes use.
- The planner is deterministic and priority-based, not a full optimization solver. It is appropriate for a hackathon demonstration, not a guaranteed exam timetable.
- Rate limiting, malware scanning, quota dashboards, automated browser E2E tests, accessibility audit and formal security review are not included.
- Gemini, Supabase and Vercel quotas and free-tier terms can change. Check current provider dashboards before a live demo.

## Folder structure

```text
src/
  app/
    (app)/                 # Authenticated pages
    api/                   # Server API routes
    auth/                  # Sign-out route
    login/                 # Signup and login
  components/               # Shared UI
  lib/
    assessment.ts           # MCQ scoring and topic classification
    document/               # Chunking
    gemini/                 # Gemini SDK wrapper and JSON parsing
    rag/                    # Embedding, retrieval and grounded answers
    planner.ts              # Revision scheduling logic
    supabase/               # Browser/server/admin clients
supabase/migrations/        # Database schema and RLS
scripts/                    # Demo user provisioning
 tests/                     # Unit tests
```
