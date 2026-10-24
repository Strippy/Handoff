# Handoff

**A friendly marketplace where vibe coders and developers buy, sell, license and team up on software projects** — from a rough idea or half-finished prototype to an app that's already earning.

Live: **https://build-swap-ship.base44.app**

Handoff is built on [Base44](https://base44.com): a React + Vite frontend, Base44 entities (database with row-level security) and Deno backend functions. There is no seeded or sample data anywhere — every listing, number and review on the site is real.

---

## What's in it

| Area | What it does |
| --- | --- |
| **Listings** | Stage ladder (Idea → Prototype → MVP → Live → Earning), five deal types (full sale, non-exclusive license, looking for a collaborator, needs finishing, free to adopt), price in AUD/USD/EUR/GBP, open-to-offers, and an honest "what's real" dossier: built with, tech stack, what works, known issues, what's included, running costs, seller-reported users/revenue, demo link. |
| **Media** | Cover image plus a gallery of images and short clips (images ≤ 10 MB, clips ≤ 60 s / 50 MB). |
| **Project scanner** | Upload a `.zip` or pick a GitHub repo → a deterministic **handoff-readiness score** (0–100), what it's built on, signs of AI tools, what's connected, what's missing, a secret scan, and an AI read of the code that pre-fills the listing. See [Project scanner](#project-scanner). |
| **GitHub sign-in** | Read-only GitHub App. Builders pick which repos Handoff may read, can scan private repos, and get a **Verified repo owner** badge when GitHub confirms their access. |
| **Messaging** | Real-time 1:1 chat tied to a listing, image/clip attachments, and a warning banner when someone suggests paying outside escrow. |
| **Offers & Deal Room** | Structured offers (accept / decline / counter / withdraw) with a nudge on offers under half the asking price. An accepted offer opens a Deal Room checklist: Escrow.com → code transfer → assets → buyer confirms → sold. Reviews unlock only after a completed deal. |
| **Community** | Public Q&A on listings, reactions (🔥 Love it, 💡 Great idea, 🛠️ I could finish this), builder profiles, follows, saves, notifications, and a Founding Builder badge for the first 100 builders. |
| **Trust & safety** | Builder's Code at onboarding, ownership attestation on every listing, report/block, and an admin moderation desk. |
| **Handoff Pro** | Optional A$8.50/month Stripe subscription. **Off until an admin switches it on** — while off, nothing is limited. See [Handoff Pro](#handoff-pro). |

Handoff never holds money for project sales: payments go through an Escrow.com transaction linked from the Deal Room. Handoff takes no cut of sales.

---

## Tech stack

- **Frontend:** React 18, Vite, React Router 7, Tailwind CSS 3, shadcn/ui (Radix), TanStack Query, lucide-react
- **Backend:** Base44 entities (`base44/entities/*.jsonc`) and Deno backend functions (`base44/functions/*/entry.ts`), via `@base44/sdk`
- **AI:** Base44 `InvokeLLM` (server-side, for the scanner's summary and listing copy only)
- **Zip handling:** `fflate` (in the scan function)

## Project layout

```
src/
  pages/        Home, ListingDetail, ListingEditor (sell/edit), Messages, Deals, DealRoom,
                Saved, Notifications, Profile, Onboarding, Admin, Pro, GithubCallback, GithubSetup
  components/   ListingForm, ProjectScanner, ScanReport, GithubRepoPicker, MessageThread,
                OfferDialog, DealChecklist, ProGate, ListingInsights, BillingAdminCard,
                … and ui/ (shadcn components)
  lib/          marketplace.js (shared constants + helpers), github.js (GitHub flow helpers),
                billing.js (plan state + Pro helpers)
base44/
  entities/     Data model + row-level security (one .jsonc per entity)
  functions/
    scan-project/   Project scanner + attaching a scan to a listing
    github/         GitHub App setup, sign-in, repo list, disconnect
    listing-sync/   View counts and deal-driven listing status (server-side)
    billing/        Handoff Pro: plan status, Stripe checkout, cancel/resume, admin switch
```

---

## Project scanner

`base44/functions/scan-project` takes a private `.zip` upload, a public GitHub link, or (when GitHub is connected) one of the builder's shared repos, and returns a report.

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

A scan is attached to a listing by the server (`action: "attach"`), and the score fields on a listing can only be written server-side, so sellers can't fake their score.

## GitHub sign-in

GitHub sign-in uses a GitHub App with **Contents: read** and **Metadata: read** only.

- **One-click setup (admin):** Admin → *Set up GitHub sign-in* posts a GitHub App manifest. GitHub creates the app and sends the credentials straight back to the `github` function. The app's private key is never stored.
- **Builders:** *Connect GitHub* → authorize → choose repos. Tokens are stored server-side and refreshed automatically. *Disconnect* also revokes the authorization on GitHub.
- **Verification:** when a repo is scanned, GitHub is asked what the builder can do on it. Admin access or repo ownership gives *Verified repo owner*; push access gives *Verified collaborator*.
- **One account rule:** a GitHub account can be linked to one Handoff account only.

Callback routes: `/github/callback` (sign-in and repo selection) and `/github/setup` (admin setup).

## Handoff Pro

An optional monthly subscription (A$8.50/month) handled by `base44/functions/billing` and Stripe. **It ships switched off.** While it's off, every feature is free and unlimited.

**Switching it on (admin):** Admin → *Handoff Pro* card → create the price in Stripe → flip the switch. The first time it's switched on, the founding window starts.

| | Free (only while Pro is on) | Pro |
| --- | --- | --- |
| Browse, message, Q&A, saves, deal rooms | ✓ | ✓ |
| Active listings at once | 2 | Unlimited |
| Code scans | 3 per rolling 30 days | Unlimited (12/day fair use) |
| Open offers at once | 3 | Unlimited |
| New listings | Visible after 48 hours | Immediately |
| Listing insights (saves, chats, offers, questions) | — | ✓ |

**Who gets Pro:**
- Admins, always.
- Paying subscribers: Stripe status `active`, `trialing` or `past_due`, until the end of the paid period.
- Founding builders: the first 100 builder profiles get Pro free for 12 months from the first switch-on. This is worked out on the server from profile creation order and can't be self-claimed.

**How billing works:**
- *Get Pro* creates a Stripe Checkout session (subscription mode). On return, `/pro?session_id=…` is confirmed server-side: the session must belong to the signed-in user.
- No webhooks. Subscription state is re-checked against Stripe every 6 hours, and straight away once a paid period ends.
- Cancel and resume set `cancel_at_period_end`, so people keep Pro until the end of the month they paid for.
- Stripe keys stay in function secrets (`STRIPE_SECRET_KEY`). Subscription records live in the server-only `Subscription` table.
- While Stripe is in test mode, admins can run a checkout with test card 4242 4242 4242 4242 before launch.

**Enforcement:** the scan limit is enforced on the server (`scan-project` asks `billing` for the plan). The listing, offer, early-access and insights limits are enforced in the UI.

---

## Security model

- **Row-level security on every entity.** Messages, conversations, offers, deals and notifications are readable only by the people involved. Listings and profiles are editable only by their owner or an admin. Reports are admin-only.
- **Server-only tables:** `AppConfig` (GitHub App credentials, Pro settings), `GithubToken` and `Subscription` deny all client access. `GithubIdentity` (the verified badge) is public to read but writable only by the server.
- **Field-level security** on `Listing.scan_id`, `scan_score`, `scan_grade` and `scan_repo_verified`.
- **Private findings:** secret-scan file paths are readable only by the scan's owner.
- **Uploaded zips** go to private storage and are read only by the scanner.

## Data model

`Listing`, `BuilderProfile`, `Conversation`, `Message`, `Offer`, `Deal`, `Review`, `Question`, `Reaction`, `SavedListing`, `Follow`, `Notification`, `Report`, `ProjectScan`, `GithubIdentity`, `GithubToken`, `Subscription`, `AppConfig`, plus Base44's built-in `User`. Schemas and access rules live in `base44/entities/`.

---

## Running locally

You'll need Node.js, the Base44 CLI (`npm install -g base44@latest`) and [Deno](https://docs.deno.com/runtime/getting_started/installation/).

```bash
npm install
base44 login   # one-time per machine
base44 link    # one-time per clone (app id: 6adbdeb30b6f86a5318d9634)
base44 dev     # local backend + frontend together
```

Open the URL `base44 dev` prints (usually `http://localhost:5173`).

- **Local data is temporary:** `base44 dev` runs entities, functions and auth locally, and entity data is in-memory only.
- **Hosted features:** Core integrations (uploads, `InvokeLLM`) and OAuth are forwarded to the hosted app.
- **Don't run `npm run dev` on its own:** it serves the UI with no backend behind it.
- **Production data mode:** `base44 dev --remote` runs the frontend against the live backend, and writes go to production data.

Checks: `npm run lint`, `npm run build`.

## Source of truth & publishing

The live app is built and deployed from the Base44 project (app id `6adbdeb30b6f86a5318d9634`). **This repo is a snapshot of it and is not auto-synced** — changes made in Base44 need to be pushed here again, and changes made here need to be published to Base44 before they go live. Keep one place as the source of truth to avoid the two drifting apart.

## License

Proprietary — all rights reserved. The code is public to view, but you may not copy, reuse, deploy or redistribute it without written permission. See [LICENSE](LICENSE). For licensing or acquisition, contact [@Strippy](https://github.com/Strippy).
