# Handoff

**A friendly marketplace where vibe coders and developers buy, sell, license and team up on software projects** — from a rough idea or half-finished prototype to an app that's already earning.

Handoff is a React + Vite app on [Vercel](https://vercel.com), with [Supabase](https://supabase.com) for the database (Postgres with row-level security), sign-in, file storage and live chat, and a small set of server functions for payments, the Deal Room, the code scanner and GitHub. There is no seeded or sample data anywhere — every listing, number and review on the site is real.

---

## What's in it

| Area | What it does |
| --- | --- |
| **Listings** | Stage ladder (Idea → Prototype → MVP → Live → Earning), five deal types (full sale, non-exclusive license, looking for a collaborator, needs finishing, free to adopt), price in AUD/USD/EUR/GBP, open-to-offers, and an honest "what's real" dossier: built with, tech stack, what works, known issues, what's included, running costs, seller-reported users/revenue, demo link. |
| **Media** | Cover image plus a gallery of images and short clips (images ≤ 10 MB, clips ≤ 60 s / 50 MB). |
| **Project scanner** | Upload a `.zip` or pick a GitHub repo → a deterministic **handoff-readiness score** (0–100), what it's built on, signs of AI tools, what's connected, what's missing, a secret scan, and an AI read of the code that pre-fills the listing. See [Project scanner](#project-scanner). |
| **GitHub sign-in** | Read-only GitHub App. Builders pick which repos Handoff may read, can scan private repos, and get a **Verified repo owner** badge when GitHub confirms their access. |
| **Messaging** | Real-time 1:1 chat tied to a listing, image/clip attachments, and a warning banner when someone suggests paying outside escrow. |
| **Offers & Deal Room** | Structured offers (accept / decline / counter / withdraw) with a nudge on offers under half the asking price. Only the other side can accept an offer, and only at the amount they saw. An accepted offer opens a server-run Deal Room: agreed handover terms → Escrow.com → recorded delivery → buyer inspection → keys rotated → sold, with a timestamped deal record. Reviews exist only for completed deals. See [Deal Room protections](#deal-room-protections). |
| **Community** | Public Q&A on listings, reactions (🔥 Love it, 💡 Great idea, 🛠️ I could finish this), builder profiles, follows, saves, notifications, and a Founding Builder badge for the first 100 builders. |
| **Trust & safety** | Builder's Code at onboarding, ownership attestation on every listing, report/block, and an admin moderation desk. |
| **Seller licence** | A$50 every 3 months to sell or license a project, with everything in Pro included. Collabs, finishing jobs and free adoptions stay free. **Off until an admin switches it on.** See [Seller licence](#seller-licence). |
| **Handoff Pro** | Optional A$8.50/month Stripe subscription. **Off until an admin switches it on** — while off, nothing is limited. See [Handoff Pro](#handoff-pro). |

Handoff never holds money for project sales: payments go through an Escrow.com transaction linked from the Deal Room. Handoff takes no cut of sales.

**Plans at a glance.** Free → Pro (A$8.50/month, for buyers and builders) → Seller licence (A$50 every 3 months, for selling, includes Pro). Nobody needs both paid plans.

---

## Tech stack

- **Frontend:** React 18, Vite, React Router 7, Tailwind CSS 3, shadcn/ui (Radix), TanStack Query, lucide-react
- **Database, auth, storage, realtime:** Supabase (Postgres 17, row-level security, Supabase Auth with email + Google, Storage, Realtime) via `@supabase/supabase-js`
- **Server functions:** TypeScript on Vercel Functions (Node.js), all behind `/api/<name>`
- **AI:** Claude via the Anthropic API (server-side, for the scanner's summary and listing copy only)
- **Zip handling:** `fflate` (in the scan function)

## Project layout

```
src/
  pages/        Home, ListingDetail, ListingEditor (sell/edit), Messages, Deals, DealRoom,
                Saved, Notifications, Profile, Onboarding, Admin, Pro, GithubCallback, GithubSetup,
                Login, Register, ForgotPassword, ResetPassword
  components/   ListingForm, ProjectScanner, ScanReport, GithubRepoPicker, MessageThread,
                OfferDialog, DealChecklist, ProGate, ListingInsights, BillingAdminCard,
                … and ui/ (shadcn components)
  api/          client.js (the app's one connection: entities, auth, functions, uploads),
                entities.js (data layer shared with the server), schema.js (tables + columns)
  lib/          marketplace.js (shared constants + helpers), github.js (GitHub flow helpers),
                billing.js (plan state + Pro helpers), AuthContext.jsx
api/[fn].ts     Vercel entry point for /api/<name>
server/
  compat.ts       Request context: current user, service-role data access, signed file links, Claude
  router.ts       /api/<name> → function
  functions/
    scan-project.ts   Project scanner + attaching a scan to a listing + recording deal deliveries
    github.ts         GitHub App setup, sign-in, repo list, disconnect
    listing-sync.ts   The only way to create a listing or change its deal type/status (licence + plan checks), view counts
    deal-room.ts      Deal state machine: accept offer, terms, escrow, receipt, problems, cancel, complete, reviews
    billing.ts        Pro + seller licence: plan status, Stripe checkout, cancel/resume, admin switches
supabase/migrations/  Tables, row-level security, guard triggers, storage buckets
tests/                Database security tests and end-to-end API tests (see Running locally)
```

---

## Project scanner

`server/functions/scan-project.ts` takes a private `.zip` upload, a public GitHub link, or (when GitHub is connected) one of the builder's shared repos, and returns a report.

**The score is deterministic** — computed only from what's in the files. The AI writes the summary and listing copy; it never changes the number.

| Check | Points |
| --- | --- |
| README | 10 |
| Setup steps in the README | 6 |
| Dependency list (package.json, requirements.txt, Unity/Godot project, …) | 8 |
| Lockfile | 4 |
| One-command run / build | 6 |
| Every env var the code reads is documented | 8 (proportional) |
| No exposed secrets | 16 |
| `.gitignore` | 4 |
| License / ownership file | 4 |
| Tests | 8 |
| Type checking / linting | 4 |
| Few TODO / FIXME markers | 4 |
| No bundled build output or dependencies | 6 |
| Deploy / release config | 8 |
| Extra docs | 4 |

Grades: **85+** Handoff-ready · **65+** Nearly there · **40+** Needs some love · below that, Early days.

The report also covers:
- **Built on:** 42 frameworks, engines and platforms, including the Unity editor version.
- **Signs of AI tools:** 10 fingerprints — Lovable, Bolt, v0, Base44, Replit, Cursor, Claude Code, Windsurf, Copilot, Firebase Studio.
- **What's connected:** 53 services, each marked *Wired up*, *Keys not documented* or *Installed, not used*.
- **Talks to:** outside API hosts the code calls.
- **Signals:** TODOs, "not implemented" markers, mock/sample data, tests.
- **Secret scan:** 13 patterns plus committed `.env` files. File and line are visible to the seller only; values are never stored.

Limits: 50 MB per zip, 12 scans per user per day. Build folders and `node_modules` are skipped.

**Scanner safety.** Uploaded code is never run and never written to disk:
- The zip is streamed in memory. Nothing is extracted to a filesystem, so path traversal (`../`) and symlinks can't reach anything. Paths are also cleaned of `..`, absolute prefixes and control characters before they're shown.
- No install scripts, build steps or parsers that execute code. The analysis is text matching only.
- **Zip bombs:** every decompressed byte is counted for real. If any file turns out bigger than its header claims, or its compressed size couldn't come from honest deflate, the whole upload is rejected. Total decompression is capped at 300 MB, unzipping at 15 s and analysis at 20 s. Only text files under 400 KB (30 MB in total) are read.
- **Prompt injection:** the AI is told the files are untrusted data and to ignore instructions inside them. It never sets the score, and its text is labelled as an AI summary that can be wrong.
- The public report says plainly that it's automated checks, not an audit or a guarantee. Public-repo scans that GitHub hasn't verified are marked *Ownership not verified*.

A scan is attached to a listing by the server (`action: "attach"`), and the score fields on a listing can only be written server-side, so sellers can't fake their score.

## GitHub sign-in

GitHub sign-in uses a GitHub App with **Contents: read** and **Metadata: read** only.

- **One-click setup (admin):** Admin → *Set up GitHub sign-in* posts a GitHub App manifest. GitHub creates the app and sends the credentials straight back to the `github` function. The app's private key is never stored.
- **Builders:** *Connect GitHub* → authorize → choose repos. Tokens are stored server-side and refreshed automatically. *Disconnect* also revokes the authorization on GitHub.
- **Verification:** when a repo is scanned, GitHub is asked what the builder can do on it. Admin access or repo ownership gives *Verified repo owner*; push access gives *Verified collaborator*.
- **One account rule:** a GitHub account can be linked to one Handoff account only.

Callback routes: `/github/callback` (sign-in and repo selection) and `/github/setup` (admin setup).

## Handoff Pro

An optional monthly subscription (A$8.50/month) handled by `server/functions/billing.ts` and Stripe. **It ships switched off.** While it's off, every feature is free and unlimited.

**Switching it on (admin):** Admin → *Handoff Pro* card → create the price in Stripe → flip the switch. The first time it's switched on, the founding window starts.

| | Free (limits apply only while Pro is on) | Pro | Seller licence |
| --- | --- | --- | --- |
| Browse, message, Q&A, saves, deal rooms | ✓ | ✓ | ✓ |
| Collabs, finishing jobs, free adoptions | ✓ | ✓ | ✓ |
| Sell or license projects for money (once licences are on) | — | — | ✓ |
| Active listings at once | 2 | Unlimited | Unlimited |
| Code scans | 3 per rolling 30 days | Unlimited (12/day fair use) | Unlimited (12/day fair use) |
| Open offers at once | 3 | Unlimited | Unlimited |
| New listings | Visible after 48 hours | Immediately | Immediately |
| Listing insights (saves, chats, offers, questions) | — | ✓ | ✓ |
| Licensed seller badge | — | — | ✓ |
| Commission on sales | None | None | None |
| Price | Free | A$8.50/month | A$50 every 3 months (≈ A$16.67/month) |

**Who gets Pro:**
- Admins, always.
- Licensed sellers: an active seller licence includes Pro (`source: "seller_licence"`).
- Paying subscribers: Stripe status `active`, `trialing` or `past_due`, until the end of the paid period.
- Founding builders: the first 100 builder profiles get Pro free for 12 months from the first switch-on. This is worked out on the server from profile creation order and can't be self-claimed.

**How billing works:**
- *Get Pro* creates a Stripe Checkout session (subscription mode). On return, `/pro?session_id=…` is confirmed server-side: the session must belong to the signed-in user.
- No webhooks. Subscription state is re-checked against Stripe every 6 hours, and straight away once a paid period ends.
- Cancel and resume set `cancel_at_period_end`, so people keep Pro until the end of the month they paid for.
- Stripe keys stay in server environment variables (`STRIPE_SECRET_KEY`). Subscription records live in the server-only `subscription` table.
- While Stripe is in test mode, admins can run a checkout with test card 4242 4242 4242 4242 before launch.

**Enforcement:** the scan limit and the active-listing limit are enforced on the server (`scan-project` and `listing-sync` ask `billing` for the plan). The offer, early-access and insights limits are enforced in the UI.

## Seller licence

A second Stripe subscription, A$50 every 3 months, handled by the same `billing` function. **It ships switched off.**

- **Needed for:** publishing a *full sale* or *licence* listing, switching a listing to one of those, and accepting an offer on one. Collabs, finishing jobs and free adoptions never need it.
- **Enforced on the server:** listings can only be created, or have their deal type or status changed, through `listing-sync`. Entity rules block those writes from the browser. Deals can only be opened through `deal-room`.
- **Includes Pro.** A licensed seller gets everything in Pro. Buying a licence stops a separate Pro subscription from renewing (`cancel_at_period_end`), Pro checkout is refused while licensed, and a cancelled Pro subscription can't be resumed on top of a licence, so nobody pays twice.
- **No commission.** Sellers keep 100% of the sale price. Escrow.com charges its own fee.
- **Who's licensed:** admins; anyone with an active licence subscription; and the first 100 builders, free for 12 months from the first switch-on.
- **Licensed seller badge:** a public check (`billing` → `seller_licence`) puts a badge next to licensed sellers on their listings.
- **If a licence lapses:** existing listings stay up and deals already in progress still finish. Buyers can't make new offers on the seller's for-sale listings (the page says the seller isn't taking offers), and the seller can't publish new for-sale listings or accept offers until they renew.

Switch it on in Admin → *Paid plans*: create the price in Stripe, then flip the switch.

## Deal Room protections

Once a buyer has the code, "it doesn't work, refund me" is the main way a seller gets ripped off. Escrow.com lets a buyer reject during the inspection period, but they have to "return" what they got, and the seller can refuse the return, which starts a dispute and then arbitration. What decides it is evidence of what was agreed and what was delivered. The Deal Room produces that evidence. Every deal write goes through `deal-room` (or `scan-project` for deliveries). Entity rules deny direct writes to deals and reviews.

1. **Agreed terms first.** The seller writes what's included, how the buyer will check it works (one check per line) and the inspection period (1–30 days, matching Escrow.com). Both sides agree to a fingerprint (sha256 of the terms + price). Editing the terms resets both agreements. The terms lock once money is in escrow.
2. **Real escrow only.** Only `https://*.escrow.com` transaction links are accepted, which stops look-alike "escrow" phishing links.
3. **Code after money.** Delivery is blocked until the seller confirms the escrow is funded.
4. **Recorded delivery.** For a zip, the server stores its sha256 and size. For a repo, it stores the exact commit. Both get a fresh scan (files, lines, score) compared against the listing's scan. The record locks once the buyer marks it received.
5. **Inspection window.** The buyer marks the code received, which starts the agreed inspection period. Downloads of the delivered zip are logged.
6. **No silent walk-away.** After delivery, the buyer can't cancel. They raise a problem against a specific agreed check instead, which goes on the record and to the admin queue. Refunds are decided through Escrow.com.
7. **Keys rotated.** The seller must confirm every key and password has been revoked or rotated before the deal can complete.
8. **Each side ticks only its own steps, in order.** A seller can't tick "buyer confirmed", and nobody can fake a completed deal.
9. **Reviews only for completed deals.** One per person per deal, written by the server. Reviews can't be edited to point at someone else.
10. **Deal record.** Every step is logged with a timestamp by the server. Either side can copy the full record (terms, fingerprints, escrow link, delivery proof, timeline) for Escrow.com.

---

## Security model

- **Row-level security on every table.** The browser talks to Postgres directly with the signed-in user's token, so access is decided by the database, not the app. Messages, conversations, offers, deals and notifications are readable only by the people involved. Listings and profiles are editable only by their owner or an admin. Reports are admin-only.
- **Server-only writes.** Deals, reviews and project scans can only be written by the server functions (service role). Listings can only be created through `listing-sync`.
- **Guard triggers** stop users changing what isn't theirs to change: a listing's `status`, `deal_type`, seller fields, `views`, attestation date and scan score; an offer's amount, parties and listing (only *decline*, *withdraw* or *counter* a pending offer — accepting happens in the Deal Room); a conversation's participants; a message's text (only *read* can change); a user's role; the Founding Builder badge (set by the database for the first 100 profiles). `id`, `created_by_id` and dates are always set by the database.
- **You can only act as yourself.** Messages must be sent as you, inside a conversation you're in, to the other person in it. Offers must name the listing's real seller. Follows, saves, reactions, questions and reports are filed under your own id.
- **Server-only tables:** `app_config` (GitHub App credentials, plan settings), `github_token` and `subscription` have no browser access at all. `github_identity` (the verified badge) is public to read but written only by the server.
- **Private findings:** secret-scan file paths live in `project_scan_private`, readable only by the scan's owner.
- **Files.** Everyone uploads into a folder named after their own user id. Project zips go to a private bucket; the server checks the zip belongs to the person asking before scanning it, and only hands out 10-minute signed download links.
- **Notifications** can only link inside the app.
- **Tests.** `tests/db/rls.test.sql` checks 76 of these rules as real signed-in users; `tests/api/` runs the full listing → scan → offer → Deal Room → review flow and the zip-bomb guards against a real Postgres + PostgREST.

## Data model

`listing`, `builder_profile`, `conversation`, `message`, `offer`, `deal`, `review`, `question`, `reaction`, `saved_listing`, `follow`, `notification`, `report`, `project_scan`, `project_scan_private`, `github_identity`, `github_token`, `subscription`, `app_config` and `users` (one row per Supabase Auth account, with `role`). Schema and access rules live in `supabase/migrations/`. In code, tables are used as `api.entities.Listing`, `api.entities.BuilderProfile`, and so on.

---

## Running locally

You'll need Node.js 22+ and a Supabase project (the free plan is fine for development).

```bash
npm install
cp .env.example .env.local     # fill in your Supabase URL and keys
npm run dev:api                # server functions on :8787
npm run dev                    # the app on :5173 (proxies /api to :8787)
```

Database: apply `supabase/migrations/` to your project in order (Supabase CLI: `supabase link` then `supabase db push`, or paste them into the SQL editor). Make yourself an admin once you've signed up: `update public.users set role = 'admin' where email = 'you@example.com';`

Checks: `npm run lint`, `npm run typecheck`, `npm run build`.

Tests need a local Postgres 15+ and a [PostgREST](https://postgrest.org) binary (no Supabase account needed):

```bash
npm run test:db                                   # row-level security suite
POSTGREST_BIN=/path/to/postgrest npm run test:api  # data layer + end-to-end API flow
```

## Deploying

- **Supabase:** apply the migrations. In *Authentication → URL configuration* set the Site URL to your domain and add it (plus Vercel preview URLs if you use them) to the redirect URLs. Turn on the Google provider if you want Google sign-in. Optional: put `{{ .Token }}` in the *Confirm signup* email template so new users also get a 6-digit code.
- **Vercel:** import the repo (framework: Vite). The production Supabase URL and publishable key are built in (`src/api/public-config.js` — public by design); override them with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `SUPABASE_URL` for another project. Set `SUPABASE_SERVICE_ROLE_KEY` (Sensitive), `APP_URL` (your domain), and `STRIPE_SECRET_KEY` / `ANTHROPIC_API_KEY` when you use payments and AI summaries. Functions run in Sydney (`syd1`) next to the database. Handoff takes payments, so it needs Vercel's Pro plan — Hobby is for non-commercial use.
- **Email:** Supabase's built-in email only delivers to your own team's addresses. Before inviting anyone, add an SMTP provider in *Authentication → Emails*.
- **GitHub sign-in:** after deploying, an admin runs *Admin → Set up GitHub sign-in* on the live domain.

## License

Proprietary — all rights reserved. The code is public to view, but you may not copy, reuse, deploy or redistribute it without written permission. See [LICENSE](LICENSE). For licensing or acquisition, contact [@Strippy](https://github.com/Strippy).
