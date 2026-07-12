# compliance-tracker

A full-stack **SaaS compliance tracker**: users register, sign in, and manage
infrastructure assets and the compliance checks applied to them, with a dashboard
summarizing status across security frameworks such as PCI-DSS and ISO 27001.

Built with **Next.js 15 (App Router)**, **React 19**, **TypeScript**,
**PostgreSQL** via **Prisma**, and **Auth.js** — one codebase covering the frontend,
the API, the database, and authentication, deployable to production.

---

## Table of contents

1. [What this application does](#1-what-this-application-does)
2. [Stack, and why each piece was chosen](#2-stack-and-why-each-piece-was-chosen)
3. [Architecture](#3-architecture)
4. [Core concepts](#4-core-concepts)
5. [Data model](#5-data-model)
6. [Security model](#6-security-model)
7. [Repository structure](#7-repository-structure)
8. [Running locally](#8-running-locally)
9. [API reference](#9-api-reference)
10. [Deploying to production](#10-deploying-to-production)
11. [Design notes and limitations](#11-design-notes-and-limitations)
12. [Possible extensions](#12-possible-extensions)

---

## 1. What this application does

Organizations must demonstrate that their systems meet the controls required by
security frameworks. Doing that requires knowing which assets exist, which controls
apply to each, and the current status of each control.

This application models that workflow:

- A user **registers** and **signs in**; all data is scoped to that account.
- The user records **assets** — servers, applications, databases, network devices,
  endpoints, cloud resources.
- Each asset carries **compliance checks**, each naming a control (for example
  `PCI-DSS 8.3.4`) and its status: compliant, non-compliant, in review, or not
  assessed.
- A **dashboard** aggregates status across all assets.

Full create/read/update/delete is available for both assets and their checks.

---

## 2. Stack, and why each piece was chosen

| Layer | Choice | Reason |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | One framework serving both the UI and the API. Server Components fetch data directly from the database with no client round-trip, and API routes live beside the pages that use them. |
| Language | **TypeScript** | Types are enforced end to end — from the database schema through the API to the React components — so a schema change surfaces as a compile error rather than a runtime bug. |
| UI | **React 19** | Server Components for data fetching and route protection; Client Components only where interactivity is genuinely required. |
| Database | **PostgreSQL** | A relational database is the right model here: assets and checks have a clear parent/child relationship with referential integrity worth enforcing. |
| ORM | **Prisma** | Generates a fully type-safe client from the schema, so queries are checked at compile time and the database shape and the TypeScript types cannot drift apart. |
| Auth | **Auth.js (NextAuth v5)** | A maintained library handling sessions, CSRF, and secure cookies. Authentication is the wrong place to hand-roll. |
| Hosting | **Vercel + managed Postgres** | Deploys the framework it was designed for, with a managed database rather than self-hosted state. |

The stack is deliberately narrow. One coherent set of tools understood deeply is
more valuable — and more defensible in review — than a wide surface of technologies
used shallowly.

---

## 3. Architecture

```
Browser
  │
  ├── Server Components ─────────────► Prisma ──► PostgreSQL
  │   (dashboard: reads data directly on the server;
  │    the database URL never reaches the browser)
  │
  └── Client Components
        │  fetch()
        ▼
      API routes (/api/*)
        │  1. auth()      → who is calling?
        │  2. zod parse   → is the input valid?
        │  3. scoped query → only rows owned by that user
        ▼
      Prisma ──► PostgreSQL
```

Reads for the dashboard happen in a **Server Component** — the query runs on the
server, and only rendered HTML is sent to the browser. Writes go through **API
routes**, because a mutation must be authenticated, validated, and authorized on
the server regardless of what the client sends.

---

## 4. Core concepts

### Server Components versus Client Components

In the App Router, components render on the server by default. A Server Component
can `await` a database query directly, and its code never ships to the browser —
which is why the dashboard can query Prisma without exposing credentials.

A component marked `"use client"` runs in the browser and is what enables
interactivity: state, event handlers, forms. The pattern used here is the standard
one — **fetch on the server, interact on the client**: `dashboard/page.tsx` (server)
loads the data and passes it to `AssetManager.tsx` (client), which owns the buttons
and forms.

### Why an ORM, and what "type-safe" means here

Prisma generates TypeScript types from `schema.prisma`. Querying a column that does
not exist, or assigning the wrong type to a field, fails at compile time rather than
in production. Renaming a database column and forgetting to update the code produces
a build error, not a silent runtime failure — the schema is the single source of
truth for both the database and the types.

### Sessions and JWTs

After sign-in, Auth.js issues a **signed JWT stored in an httpOnly cookie**.
`httpOnly` means client-side JavaScript cannot read it, which blocks the most common
route to session theft via XSS. The token is signed with `AUTH_SECRET`, so it cannot
be forged or tampered with. Every server-side `auth()` call verifies that signature
before returning a session.

### Password hashing

Passwords are hashed with **bcrypt** at cost factor 12 and never stored in plaintext.
bcrypt is deliberately slow, which is the point: it makes offline brute-forcing of a
stolen database expensive. The cost factor is a tunable work parameter that can be
raised as hardware gets faster.

---

## 5. Data model

```
User ──1:N──► Asset ──1:N──► ComplianceCheck
```

- **User** — account identity and credentials (`passwordHash`, never a password).
- **Asset** — a system in scope (`name`, `type`, `owner`, `description`), owned by
  exactly one user via `userId`.
- **ComplianceCheck** — one control assessed against one asset (`framework`,
  `status`, `notes`, `lastChecked`).

`userId` on `Asset` is the **tenant boundary**: every query filters on it, which is
what prevents one user from reading another's data. Deletes cascade (removing an
asset removes its checks), and `userId`/`assetId` are indexed because they appear in
the `WHERE` clause of nearly every query.

---

## 6. Security model

Security is enforced **on the server**, on every request. The browser is treated as
untrusted, because it is: any client-side check can be bypassed with `curl`.

**Authentication.** Every API route begins by calling `auth()`. No session, no
access — the route returns `401` before touching the database.

**Authorization and IDOR.** The classic vulnerability in a CRUD application is
**Insecure Direct Object Reference**: a signed-in user changes the `id` in a URL and
edits somebody else's record. The fix is applied consistently — ownership is part of
the query itself, never a separate check:

```ts
// Correct: id AND userId must both match, so a foreign id matches zero rows.
await prisma.asset.updateMany({
  where: { id, userId: session.user.id },
  data,
});
```

Nested resources are checked through the relation
(`where: { id, asset: { userId: session.user.id } }`), so a compliance check can only
be modified by the owner of its parent asset.

**Input validation.** Every write parses its body with a **Zod** schema before use.
Anything unexpected is rejected with `400`.

**Ownership is never taken from the request body.** `userId` always comes from the
server-side session. Accepting it from the client would let a caller create rows
owned by another user.

**Enumeration resistance.** Sign-in failures and duplicate registrations return
generic messages. Distinguishing "no such user" from "wrong password" would let an
attacker discover which email addresses are registered. Similarly, requests for
resources the caller does not own return `404`, not `403`, so the response does not
confirm the resource exists.

**Defence in depth.** Route protection exists in two places: each protected page
checks the session itself, and `middleware.ts` independently guards the protected
paths — so a new page that forgets its own check is still covered.

**Secrets.** `AUTH_SECRET` and `DATABASE_URL` are environment variables. `.env` is
gitignored and must never be committed.

---

## 7. Repository structure

```
compliance-tracker/
├── prisma/
│   ├── schema.prisma          # Data model — source of truth for DB and types
│   └── seed.ts                # Idempotent demo data
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx      # Sign-in (client)
│   │   │   └── register/page.tsx   # Registration (client)
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts  # Auth.js handlers
│   │   │   ├── register/route.ts            # Account creation + bcrypt
│   │   │   ├── assets/route.ts              # GET list, POST create
│   │   │   ├── assets/[id]/route.ts         # PATCH, DELETE (IDOR-safe)
│   │   │   ├── assets/[id]/checks/route.ts  # POST a check to an asset
│   │   │   └── checks/[id]/route.ts         # PATCH, DELETE a check
│   │   ├── dashboard/page.tsx     # Protected dashboard (server)
│   │   ├── layout.tsx
│   │   ├── page.tsx               # Landing
│   │   └── globals.css
│   ├── components/
│   │   └── AssetManager.tsx       # Interactive CRUD (client)
│   ├── lib/
│   │   ├── auth.ts                # Auth.js config, credentials provider
│   │   ├── prisma.ts              # Prisma client singleton
│   │   └── validation.ts          # Zod schemas
│   ├── types/next-auth.d.ts       # Session type augmentation
│   └── middleware.ts              # Edge route protection
├── .env.example
└── package.json
```

---

## 8. Running locally

**Requirements:** Node.js 18.18+ and a PostgreSQL database (local, Docker, or a free
hosted instance from a provider such as Neon or Supabase).

### Step 1 — Install dependencies

```bash
npm install
```

### Step 2 — Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

- `DATABASE_URL` — the PostgreSQL connection string.
- `AUTH_SECRET` — generate one: `openssl rand -base64 32`
- `AUTH_URL` — `http://localhost:3000` for local development.

A local database via Docker, if needed:

```bash
docker run --name compliance-db -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=compliance_tracker -p 5432:5432 -d postgres:16
```

### Step 3 — Create the schema

```bash
npx prisma db push
```

This applies `schema.prisma` to the database and generates the type-safe client.

### Step 4 — Seed demo data (optional)

```bash
npm run db:seed
```

Creates a demo account — **demo@example.com / demo1234** — with three assets and
several checks.

### Step 5 — Run

```bash
npm run dev
```

Open `http://localhost:3000`. Register a new account, or sign in with the seeded
demo credentials.

**Useful commands**

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run db:push` | Apply schema changes to the database |
| `npm run db:studio` | Browse the database in a GUI |
| `npm run db:seed` | Load demo data |

---

## 9. API reference

All routes require an authenticated session and operate only on the caller's own
data.

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/register` | Create an account |
| `GET` | `/api/assets` | List the caller's assets with their checks |
| `POST` | `/api/assets` | Create an asset |
| `PATCH` | `/api/assets/:id` | Update an asset |
| `DELETE` | `/api/assets/:id` | Delete an asset (cascades to its checks) |
| `POST` | `/api/assets/:id/checks` | Add a compliance check to an asset |
| `PATCH` | `/api/checks/:id` | Update a check |
| `DELETE` | `/api/checks/:id` | Delete a check |

Sign-in, sign-out, and session endpoints are handled by Auth.js under
`/api/auth/*`.

Responses: `401` unauthenticated, `400` invalid input, `404` not found or not owned
by the caller, `409` duplicate registration.

---

## 10. Deploying to production

### Step 1 — Provision a database

Create a hosted PostgreSQL instance (Neon, Supabase, and Vercel Postgres all offer a
free tier) and copy its **pooled** connection string. Serverless functions open many
short-lived connections, which is exactly what a pooled connection string is for.

### Step 2 — Push the repository to GitHub

```bash
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/<user>/compliance-tracker.git
git push -u origin main
```

Confirm `.env` is **not** in the commit: `git ls-files | grep .env` should return
only `.env.example`.

### Step 3 — Deploy on Vercel

Import the repository at vercel.com. Set three environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | The pooled connection string from step 1 |
| `AUTH_SECRET` | A fresh secret — `openssl rand -base64 32` (do not reuse the local one) |
| `AUTH_URL` | The deployed URL, for example `https://compliance-tracker.vercel.app` |

Deploy. The build script runs `prisma generate` before `next build`, so the client is
generated in the build environment.

### Step 4 — Create the schema in the production database

```bash
DATABASE_URL="<production-url>" npx prisma db push
```

### Step 5 — Verify

Register an account on the deployed URL, create an asset, add a check, and confirm
the dashboard updates. Then sign out and confirm `/dashboard` redirects to `/login`.

---

## 11. Design notes and limitations

This is a complete but deliberately scoped application. It implements
authentication, authorization, validated CRUD, a relational data model, and a
production deployment path. It does **not** include automated tests, email
verification or password reset, rate limiting on the auth endpoints, role-based
access control (every user is an individual tenant with no notion of shared
organizations), audit logging of changes, or pagination — each of which a production
system would require, and each of which is a natural extension rather than a
rewrite.

The compliance model is simplified: real frameworks define controls with
relationships, evidence requirements, and review cycles that this data model does not
attempt to capture.

---

## 12. Possible extensions

- **Tests** — unit tests for the Zod schemas and integration tests asserting that a
  user cannot read or modify another user's assets (the IDOR case is exactly what a
  test should pin down).
- **Organizations and RBAC** — a `Team` model so multiple users share assets, with
  roles (owner/editor/viewer) enforced server-side.
- **Audit trail** — an append-only log of who changed which check and when, which is
  itself a common compliance requirement.
- **Rate limiting** on `/api/register` and sign-in to blunt credential-stuffing.
- **Evidence attachments** — file uploads supporting each check.
- **Reporting** — export a framework-scoped compliance report as PDF or CSV.

---

## License

Released under the MIT License. See [LICENSE](LICENSE) for details.
