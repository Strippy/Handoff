# AGENTS.md

## Project context

Handoff is user-owned application code: a React + Vite app hosted on Vercel, with Supabase for the
database (Postgres + row-level security), auth, storage and realtime, and server functions under
`/api`. Keep changes focused on the request and follow the existing conventions. There is no seeded
or sample data anywhere, and none should be added.

Start with `README.md` for setup, environment variables and deployment.

## Key files

- `src/api/client.js` — the app's single backend connection (`api.entities`, `api.auth`, `api.functions`, `api.integrations`).
- `src/api/entities.js` — data layer shared by browser and server; Mongo-style filters → PostgREST.
- `src/api/schema.js` — tables and column kinds. Keep it in step with `supabase/migrations/`.
- `server/functions/*.ts` — server functions (service role). `server/router.ts` maps `/api/<name>` to them.
- `supabase/migrations/` — schema, row-level security and guard triggers. Add a new migration for every change; never edit one that has been applied.
- `.env.local` — local-only values; never commit secrets.

## Rules that keep users safe

- Anything trust- or money-related (listing status/deal type, deals, reviews, scans, billing) is written only by server functions. Don't add browser write paths for these.
- Every new table needs RLS enabled and explicit policies, plus guard triggers for columns users must not change.
- Files: users upload only into their own folder; the server must check ownership before reading a private file.

## Checks

Run before finishing code changes: `npm run lint`, `npm run typecheck`, `npm run build`, and when the
database or server changed, `npm run test:db` and `npm run test:api` (see README for the local test setup).
