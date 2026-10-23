# SkillDock

Build because, apparently boredom is a startup idea.

SkillDock is a full-stack recruiting intelligence platform for technical hiring teams. It ingests job descriptions, scores a candidate pool against the role, and surfaces ranked shortlists with explainable match reasoning, skills gaps, and recruiter-friendly summaries.

The product is built around a practical workflow:

- create or import a job brief
- parse the JD into structured fields
- evaluate candidates against weighted criteria
- rank the strongest fits
- review score breakdowns and skill gaps
- export or share ranking results

This repository contains the complete monorepo for the product, including the API backend, the web application, the shared database schema, generated API typings, and setup scripts.

## Why this exists

Recruiting teams often struggle with fragmented, opaque candidate ranking. SkillDock is designed to make that workflow more structured and transparent:

- recruiters can maintain a pool of candidate profiles
- job requirements are extracted and normalized
- candidates are scored using a hybrid model rather than raw keyword matching
- ranking outcomes explain why someone is a good fit or where they are missing gaps
- results can be reviewed, filtered, and exported quickly

## Product overview

The app is centered on a recruiter dashboard and a fast ranking flow.

### Core use cases

1. Job description management
   - create job briefs
   - parse skills, experience, education, domain, and seniority
   - save structured job data for future rankings

2. Candidate pool management
   - browse candidates
   - search by name, title, or company
   - view profile details and skills
   - review education and experience trends

3. Ranking engine
   - run candidate ranking against a job
   - filter by minimum score
   - return top-ranked candidates
   - generate AI or heuristic rationale for each result

4. Result review
   - inspect score breakdown by semantic fit, experience, education, activity, and trajectory
   - compare matched vs missing skills
   - shortlist candidates for further review
   - export rankings to CSV

## Architecture

This repo is structured as a pnpm workspace with separate packages for the backend, frontend, shared database layer, API contract, and generated clients.

### Workspace layout

- `artifacts/api-server` — Express API server
- `artifacts/candidate-iq` — React + Vite frontend
- `lib/db` — Drizzle/Postgres schema definitions
- `lib/api-spec` — OpenAPI contract
- `lib/api-client-react` — generated client hooks
- `lib/api-zod` — generated Zod schemas
- `scripts` — DB setup and data import utilities

## Stack

### Backend

- Node.js
- TypeScript
- Express 5
- PostgreSQL
- Drizzle ORM
- OpenAI API (optional)
- PDF and DOCX text extraction
- pino logging

### Frontend

- React 19
- Vite
- Wouter for routing
- TanStack Query
- Tailwind CSS
- Framer Motion
- Radix UI primitives
- Recharts
- Firebase Auth

### Shared tooling

- pnpm workspaces
- TypeScript 5.9
- OpenAPI-driven code generation
- Zod validation

## Database model

The database layer is defined in `lib/db/src/schema`.

### `jobs`
Stores job descriptions and parsed metadata:

- id
- title
- raw_text
- required_skills
- preferred_skills
- min_experience
- education_requirement
- domain
- seniority_level
- created_at

### `candidates`
Stores candidate profile data:

- id
- name
- email
- current_title
- current_company
- years_experience
- education_level
- skills
- resume_text
- location
- linkedin_url
- activity_score
- created_at

### `ranking_runs`
Stores each ranking job run:

- id
- job_id
- status
- top_n
- min_score
- total_candidates
- shortlisted_count
- created_at
- completed_at

### `ranking_results`
Stores candidate-level score data for each run:

- id
- ranking_id
- candidate_id
- rank
- composite_score
- semantic_score
- experience_score
- education_score
- activity_score
- trajectory_score
- rationale
- matched_skills
- missing_skills

## API design

The API contract is defined in `lib/api-spec/openapi.yaml` and is treated as the source of truth for the project.

The main route groups are:

- `/api/healthz`
- `/api/jobs`
- `/api/candidates`
- `/api/candidates/stats`
- `/api/rankings`
- `/api/rank`
- `/api/documents/extract`

The project intentionally uses generated clients from the OpenAPI spec instead of writing ad-hoc frontend fetch code.

## Ranking algorithm

The ranking engine is implemented in `artifacts/api-server/src/lib/scorer.ts`.

The composite score is built from five weighted dimensions:

- semantic score: 35%
- experience score: 25%
- education score: 15%
- activity score: 15%
- trajectory score: 10%

The score model is designed to balance:

- skill match quality
- practical experience
- role fit and seniority
- profile completeness
- domain alignment

The algorithm tries to go beyond raw keyword matching by evaluating:

- required skills vs candidate skills
- preferred skills vs candidate strengths
- resume text similarity to JD content
- role-specific evidence such as retrieval, ranking, vector DB, ML systems, and product engineering signals
- penalties for weak or mismatched profiles

## AI and fallback behavior

The OpenAI layer in `artifacts/api-server/src/lib/openai.ts` is used for:

- extracting structured fields from job descriptions
- generating recruiter-facing rationale for each candidate match

If `OPENAI_API_KEY` is absent, the app falls back to heuristic extraction and basic rationale generation. This means the product remains functional without a paid AI dependency.

## Quick Rank workflow

The main quick-ranking flow is handled by `artifacts/api-server/src/routes/rank.ts` and the frontend page at `artifacts/candidate-iq/src/pages/quick-rank.tsx`.

The flow is:

1. paste or upload a job description
2. parse the job requirements
3. score the candidate pool
4. rank by composite score
5. generate matched/missing skills and rationale
6. show results with filtering and sorting
7. allow shortlist and export actions

This is the most user-facing and product-focused part of the system.

## Frontend overview

The frontend app is organized around a recruiter dashboard and a ranking workspace.

Key screens include:

- dashboard overview
- job brief management
- candidate directory and profile pages
- quick-rank entry
- ranked candidate results
- settings and auth flow

The UI uses a polished editorial style with a modern recruiter-focused visual system and a dark/light theme.

## Authentication

The frontend uses Firebase for authentication:

- Google sign-in
- email/password sign-in
- signup
- password reset
- email verification
- persistent session support

The auth state is managed in `artifacts/candidate-iq/src/components/auth-provider.tsx`.

## Scripts and setup

The project expects Node.js 22+ and pnpm.

### Install dependencies

```bash
pnpm install
```

### Run the backend

```bash
pnpm --filter @workspace/api-server run dev
```

### Run the frontend

```bash
pnpm --filter @workspace/candidate-iq run dev
```

### Full typecheck

```bash
pnpm run typecheck
```

### Full build

```bash
pnpm run build
```

## Environment variables

### Backend

Create a local environment file with:

```bash
DATABASE_URL=your_postgres_connection_string
PORT=8080
NODE_ENV=development
OPENAI_API_KEY=optional
```

### Frontend

The frontend requires Firebase values such as:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

## Data setup and imports

The repo includes setup utilities under `scripts` for:

- creating database tables
- seeding a Redrob-style demo job
- importing candidate data

These scripts are helpful for bootstrapping a working local dataset before running the app.

## Repo health and conventions

This repo follows a disciplined monorepo pattern:

- shared API schema first
- generated client and validation layers
- typed backend implementation
- service-level logic isolated from route handlers
- explicit environment configuration
- fallback behavior when AI is unavailable

The project is designed to be both product-ready and demo-friendly.

## License

This repository does not currently specify a license in the project metadata. Please check the repository settings and legal requirements before using it in production or distributing it externally.

## Status

SkillDock is a functional recruiting intelligence platform prototype focused on candidate ranking, explainability, and recruiter workflow support.

## Notes

The repository includes a helpful setup guide in `BACKEND_SETUP_GUIDE.md` for more detailed environment and local startup instructions.
