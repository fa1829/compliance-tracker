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
7. [How the code works](#7-how-the-code-works)
8. [Troubleshooting](#8-troubleshooting)
9. [Repository structure](#9-repository-structure)
10. [Running locally](#10-running-locally)
11. [API reference](#11-api-reference)
12. [Deploying to production (Vercel)](#12-deploying-to-production-vercel)
13. [Deployment alternatives, domains, and private hosting](#13-deployment-alternatives-domains-and-private-hosting)
14. [Design notes and limitations](#14-design-notes-and-limitations)
15. [Possible extensions](#15-possible-extensions)

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
untrusted, because it is: any client-side check can be bypassed with `curl`, a
proxy, or the browser's own developer tools. Every control below is therefore
implemented server-side.

The controls are grouped against the categories in the **OWASP Top 10**, since that
is the standard vocabulary for web application risk.

### Authentication (who is this?)

**Password storage.** Passwords are hashed with **bcrypt** at cost factor 12 and are
never stored, logged, or returned in plaintext. bcrypt is *deliberately slow*: the
cost factor sets how much work each hash requires, so an attacker who steals the
database still faces an expensive offline brute-force per password. The cost factor is
a tunable parameter that can be raised as hardware improves. (bcrypt also salts each
hash automatically, which is what defeats rainbow-table attacks — two users with the
same password produce different hashes.)

**Session handling.** After sign-in, Auth.js issues a **signed JWT stored in an
httpOnly cookie**:

- `httpOnly` — client-side JavaScript cannot read the cookie, which blocks the most
  common route to session theft via XSS.
- `Secure` (in production) — the cookie is only transmitted over HTTPS.
- `SameSite` — restricts the cookie from being sent on cross-site requests, which is a
  primary CSRF defence.
- **Signed** with `AUTH_SECRET` — the token cannot be forged or tampered with. Every
  server-side `auth()` call verifies that signature before returning a session.

**Enumeration resistance.** A failed sign-in returns an identical generic response
whether the email does not exist or the password is wrong. Distinguishing the two would
let an attacker discover which addresses are registered — an information leak that
feeds credential-stuffing and phishing. Registration behaves the same way: a duplicate
email returns a generic message rather than confirming the account exists.

### Authorization / access control (what may they do?)

*OWASP A01: Broken Access Control — the most common category of serious web
vulnerability.*

**Insecure Direct Object Reference (IDOR)** is the classic failure in a CRUD
application: a legitimately signed-in user changes an id in a URL and reads or modifies
someone else's record. Authentication alone does not prevent this — the attacker *is*
authenticated; they are simply authenticated as somebody else.

The defence used throughout this application is to make **ownership part of the query
itself**, never a separate check:

```ts
// Correct — id AND userId must both match.
await prisma.asset.updateMany({
  where: { id, userId: session.user.id },
  data,
});
// A foreign id matches zero rows: nothing is modified, and the route returns 404.
```

Compare the vulnerable pattern this deliberately avoids:

```ts
// WRONG — fetch first, then check. Race-prone and easy to forget.
const asset = await prisma.asset.findUnique({ where: { id } });
if (asset.userId !== session.user.id) return 403;   // one forgotten line = breach
```

Expressing ownership inside the `where` clause makes the safe path the *only* path:
there is no separate check that can be omitted.

**Nested resources** are protected through the relation, so a compliance check is
reachable only by the owner of its parent asset:

```ts
where: { id, asset: { userId: session.user.id } }
```

**Ownership is never accepted from the client.** `userId` always comes from the
server-side session, never from the request body. Accepting it from the body would let
a caller create rows owned by another user — a trivial and complete bypass.

**404 rather than 403.** A request for a resource the caller does not own returns
`404 Not Found`, not `403 Forbidden`. `403` would confirm the resource exists, which is
itself an information leak enabling resource enumeration.

**Tenant isolation** is therefore a property of every query in the application: the
`userId` column on `Asset` is the boundary, and no query crosses it.

### Input validation

*OWASP A03: Injection.*

Every write path parses its request body with a **Zod schema** before the data is used:

```ts
const parsed = assetSchema.safeParse(await req.json());
if (!parsed.success) return NextResponse.json({ error: … }, { status: 400 });
```

Unexpected fields are stripped, types are enforced, lengths are bounded, and enum values
are constrained to the permitted set. Validation lives on the **server**, because the
client's own validation (HTML `required`, `minLength`) is a usability feature, not a
security control — it is trivially bypassed.

**SQL injection** is structurally prevented: Prisma generates **parameterized queries**.
User input is always passed as a bound parameter, never concatenated into SQL text, so
input cannot alter query structure. (Raw-SQL escape hatches such as `$queryRawUnsafe`
exist in Prisma but are not used here.)

### Cross-site scripting (XSS)

*OWASP A03.*

React **escapes interpolated values by default** when rendering. A value such as
`<script>alert(1)</script>` stored in an asset's description is rendered as literal
text, not executed as markup. The application does not use `dangerouslySetInnerHTML`
anywhere — that API is the primary way this protection gets disabled, and it is
deliberately absent.

The `httpOnly` session cookie provides defence in depth: even in the event of a
successful XSS, the session token cannot be read by injected script.

### Cross-site request forgery (CSRF)

Auth.js issues and verifies CSRF tokens for its own authentication endpoints, and the
session cookie's `SameSite` attribute prevents it from being attached to cross-site
requests. Additionally, the application's write endpoints accept only JSON bodies
(`Content-Type: application/json`), which cannot be produced by a simple cross-origin
HTML form submission without triggering a CORS preflight.

### Secrets management

*OWASP A05: Security Misconfiguration.*

- `AUTH_SECRET` and `DATABASE_URL` are supplied as **environment variables**, never
  committed. `.env` is gitignored; only `.env.example` (containing placeholders) is in
  version control.
- **Production secrets differ from development secrets.** The deployed application uses
  a separately generated `AUTH_SECRET`.
- Secrets do not appear in command-line arguments or URLs, both of which are commonly
  captured in shell history, process listings, and server logs.
- On a platform such as Vercel, secrets are injected at build/run time from encrypted
  storage; on self-hosted infrastructure the equivalent is a secrets manager (AWS
  Secrets Manager, SSM Parameter Store) rather than a plaintext file.

### Dependency and supply-chain security

*OWASP A06: Vulnerable and Outdated Components.*

`npm audit` is run against the dependency tree, and findings are **assessed rather than
blindly applied** — see section 8, where an automated "fix" would have downgraded the
framework by six major versions, and where a reported advisory was determined to be
unreachable in this application's context. Judging exploitability in context is part of
the work; treating every advisory as equally urgent is not a security posture.

### Defence in depth

Route protection exists at **two independent layers**:

1. **Middleware** (`src/middleware.ts`) — a cheap check at the edge that redirects
   requests to protected paths lacking a session cookie.
2. **The page itself** (`src/app/dashboard/page.tsx`) — calls `auth()`, which
   cryptographically verifies the JWT signature.

Layer 1 is a filter, not a gate: a forged cookie would pass it and then be correctly
rejected by layer 2. The security guarantee rests on layer 2. The value of layer 1 is
that a newly added protected page that *forgets* its own check is still covered, and
that obviously-unauthenticated requests are rejected before any rendering work occurs.

### Transport security

In production, the platform terminates **TLS** and serves the application over HTTPS
only, with HTTP redirected. This protects credentials and session cookies in transit.
The `Secure` cookie attribute depends on it.

### What is deliberately not implemented

Stating the gaps honestly is part of the security model:

- **No rate limiting** on sign-in or registration. A production deployment should add it
  (per-IP and per-account) to blunt credential stuffing and brute-force attempts.
- **No account lockout** after repeated failures — related to the above.
- **No multi-factor authentication.**
- **No email verification or password reset flow.**
- **No audit log** of who changed which record and when — which is itself a common
  compliance requirement for an application of this type.
- **No role-based access control.** Every user is an isolated tenant; there is no
  concept of shared organizations with differentiated permissions.
- **No security headers** (Content-Security-Policy, HSTS, X-Frame-Options) beyond the
  platform's defaults.

Each is listed in section 15 as an extension.

---

## 7. How the code works

This section walks the request lifecycle, so each file's role is clear.

### Reading data: the dashboard

`src/app/dashboard/page.tsx` is a **Server Component** — it runs on the server only,
and its code is never sent to the browser.

```ts
const session = await auth();                    // 1. who is this?
if (!session?.user?.id) redirect("/login");      // 2. gate the page

const assets = await prisma.asset.findMany({     // 3. query, scoped to the user
  where: { userId: session.user.id },
  include: { checks: true },
});
```

Three things happen in order: the session is verified, the request is rejected if
unauthenticated, and the database is queried **directly** — no `fetch`, no API round
trip, no loading spinner. Because this code never reaches the browser, the database
connection string is never exposed. The rendered HTML is what ships.

The fetched data is then handed to a Client Component:

```tsx
<AssetManager initialAssets={JSON.parse(JSON.stringify(assets))} />
```

The `JSON.parse(JSON.stringify(...))` step serializes Prisma's `Date` objects into
plain strings, because only serializable values can cross the server→client boundary.

### Writing data: the API routes

Mutations cannot happen in a Server Component's render pass, so they go through API
routes. Every write route follows the same three-step shape — this pattern is the
core of the application's safety:

```ts
// src/app/api/assets/route.ts (POST)
const session = await auth();                              // 1. AUTHENTICATE
if (!session?.user?.id) return 401;

const parsed = assetSchema.safeParse(await req.json());    // 2. VALIDATE
if (!parsed.success) return 400;

await prisma.asset.create({                                // 3. AUTHORIZE
  data: { ...parsed.data, userId: session.user.id },       //    (ownership from
});                                                        //     the session)
```

**Authenticate → validate → authorize.** Skip any one and the route is exploitable.

### Updating and deleting: ownership in the query

`src/app/api/assets/[id]/route.ts` is where the most important security decision
lives:

```ts
const result = await prisma.asset.updateMany({
  where: { id, userId: session.user.id },   // BOTH must match
  data: parsed.data,
});
if (result.count === 0) return 404;
```

Ownership is expressed **inside the query**, not as a separate `if` check beforehand.
A request for someone else's asset id matches zero rows, so nothing is modified and
the route returns `404`. Section 6 explains why this matters (IDOR).

For nested resources (`src/app/api/checks/[id]/route.ts`), ownership is traced through
the relation:

```ts
where: { id, asset: { userId: session.user.id } }
```

A compliance check is only reachable by the owner of its parent asset.

### Authentication: `src/lib/auth.ts`

The `authorize` callback is what runs on every sign-in attempt:

```ts
const user = await prisma.user.findUnique({ where: { email } });
if (!user?.passwordHash) return null;                     // no such user
const valid = await bcrypt.compare(password, user.passwordHash);
if (!valid) return null;                                  // wrong password
return { id: user.id, name: user.name, email: user.email };
```

Both failure paths return an identical `null` — deliberately (section 6). On success,
the `jwt` and `session` callbacks copy the user's id into the token and then onto the
session object, which is what makes `session.user.id` available for the query scoping
shown above.

### Registration: `src/app/api/register/route.ts`

```ts
const passwordHash = await bcrypt.hash(password, 12);
await prisma.user.create({ data: { name, email, passwordHash } });
return NextResponse.json({ ok: true }, { status: 201 });
```

The plaintext password is hashed and immediately discarded. The created user object
is **not** returned, because it contains the hash.

### The client component: `src/components/AssetManager.tsx`

This is the only substantially interactive part. Its central pattern is optimistic-free
refresh:

```ts
const res = await fetch(url, { method, body: JSON.stringify(body) });
if (!res.ok) { setError(...); return false; }
router.refresh();          // re-run the Server Component, stream fresh data
```

There is no client-side data cache to keep in sync. After a successful mutation,
`router.refresh()` re-executes the Server Component on the server, which re-queries
the database and streams down updated HTML. The server remains the single source of
truth, which is what keeps the state management trivial.

### The Prisma singleton: `src/lib/prisma.ts`

In development, hot-reloading re-executes modules on every file change. Without a
guard, each reload would construct a new `PrismaClient` — and each client opens its
own connection pool, eventually exhausting the database's connection limit. Caching
the instance on `globalThis` keeps exactly one client alive across reloads.

---

## 8. Troubleshooting

These are real failures encountered while building and deploying this application.
Each is included because the underlying cause generalizes.

### `Cannot read properties of null (reading 'reset')`

**Symptom:** creating an asset succeeded (the row appeared), but the browser threw a
runtime error immediately afterward.

**Cause:** React pools and recycles synthetic event objects. Once the event handler's
*synchronous* phase ends, `e.currentTarget` is set to `null`. The original code did:

```ts
const form = new FormData(e.currentTarget);   // fine — still synchronous
await mutate(...);                             // ← async boundary crossed
e.currentTarget.reset();                       // currentTarget is now null
```

**Fix:** capture a direct reference to the DOM element *before* the `await`:

```ts
const formEl = e.currentTarget;                // capture before crossing
const form = new FormData(formEl);
const ok = await mutate(...);
if (ok) formEl.reset();                        // a real element, not a pooled event
```

**Generalizes to:** any React handler that touches `e.currentTarget` or `e.target`
after an `await`. The event is not durable across the async boundary.

### `The Edge Function "src/middleware" size is 1.02 MB and your plan size limit is 1 MB`

**Symptom:** the Next.js build succeeded — all routes compiled — but the deployment
failed at the packaging step.

**Cause:** middleware runs on the **Edge runtime**, which enforces a hard ~1 MB bundle
limit. The original middleware imported the full Auth.js configuration, which
transitively pulled in the Prisma adapter and the Prisma client. Prisma is far too
heavy for an Edge bundle.

**Fix:** middleware now performs a cheap session-cookie *presence* check with no heavy
imports (see `src/middleware.ts`). This is safe because middleware was never the
authoritative gate — each protected page independently calls `auth()`, which verifies
the JWT signature. A forged cookie would pass middleware and then be correctly rejected
at the page. Middleware is a cheap first-pass filter; the real check happens server-side.

**Generalizes to:** anything imported into middleware or an Edge function must be
Edge-compatible and small. Database clients generally are not.

### `npm audit fix --force` proposing a catastrophic "fix"

**Symptom:** `npm audit` reported a vulnerability and offered `--force` to resolve it.

**Cause:** the remaining advisory is a transitive PostCSS issue reached through
`next-auth → next → postcss`. npm could not find a clean resolution, so it proposed
installing **`next@9.3.3`** — a downgrade of six major versions that would have
destroyed the application (no App Router, no Server Components).

**Fix:** upgrade the direct dependency instead (`npm install next@15`), which patched
the actual critical CVE. The residual PostCSS advisory was then assessed rather than
blindly "fixed": it concerns unescaped `</style>` in CSS stringify output, and this
application's only CSS is a static stylesheet authored in the repository. There is no
path by which untrusted input reaches PostCSS, so the vulnerability is **not reachable
here**.

**Generalizes to:** always read what `--force` intends to do before running it, and
assess whether a reported vulnerability is actually reachable in the application's
context rather than treating every advisory as equally urgent.

### Prisma client not generated on the deployment platform

**Symptom:** type errors referencing `@prisma/client` in a fresh environment.

**Cause:** Prisma generates its client from the schema at install/build time; a clean
CI checkout has no generated client.

**Fix:** the build script runs generation first —
`"build": "prisma generate && next build"` — so the client exists before the
application is compiled.

### Schema exists locally but not in the production database

**Symptom:** the application deploys successfully, then fails at runtime the first time
a user registers.

**Cause:** `prisma db push` was run against the local database only. The hosted
database was empty — no tables.

**Fix:** run the push explicitly against the production connection string:

```bash
DATABASE_URL="<production-url>" npx prisma db push
```

**Generalizes to:** a successful build proves the code compiles; it does not prove the
runtime environment (database, environment variables) is correctly provisioned. These
are separate failure domains.

---
## 9. Repository structure

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

## 10. Running locally

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

## 11. API reference

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

## 12. Deploying to production (Vercel)

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

## 13. Deployment alternatives, domains, and private hosting

The primary deployment path (section 12) uses Vercel with a managed PostgreSQL
instance. That is the lowest-friction option for this stack, but it is not the only
one, and the right choice depends on constraints that differ by organization. This
section covers the realistic alternatives.

### What "serverless" actually means here, and its consequences

On Vercel, each API route becomes a **serverless function**: a short-lived process
spun up per request and torn down afterward. This has direct architectural
consequences that explain several choices in this project:

- **Database connections must be pooled.** Many short-lived functions each opening a
  direct connection would exhaust the database's connection limit. This is why the
  deployment instructions specify a *pooled* connection string.
- **No in-process state persists between requests.** Anything that must survive
  belongs in the database.
- **Cold starts** add latency to the first request after an idle period.

A traditional always-on server (the EC2 option below) has the opposite profile:
persistent connections, in-process caching available, no cold starts — but the
operator is responsible for uptime, patching, and scaling.

### Option A — Vercel + managed Postgres (the default here)

| | |
|---|---|
| **Best for** | Portfolio projects, startups, teams without dedicated infrastructure staff |
| **Effort** | Minimal — connect the repository, set environment variables, deploy |
| **Cost** | Free tier is sufficient for this application |
| **Tradeoff** | Least control; vendor-managed platform; serverless constraints above |

### Option B — AWS EC2 (a traditional virtual server)

Running the application on a virtual machine that the operator controls end to end.

**Shape of the deployment:**

1. **Provision an EC2 instance** (a `t3.micro` is adequate for this workload) inside a
   VPC, with a security group permitting inbound `443` (HTTPS) and `80` (redirect only),
   and SSH restricted to a specific source address.
2. **Provision the database.** Either **RDS for PostgreSQL** (managed: automatic
   backups, patching, failover) or PostgreSQL installed on the instance itself
   (cheaper, but the operator becomes the DBA). RDS in a *private* subnet, reachable
   only from the application's security group, is the standard pattern — the database
   is never exposed to the internet.
3. **Run the application** with a process manager (`pm2`, or a `systemd` unit) so it
   restarts on crash and starts on boot.
4. **Put nginx in front** as a reverse proxy: it terminates TLS, serves static assets,
   and forwards application requests to the Node process on `localhost:3000`.
5. **Obtain a TLS certificate** with Certbot/Let's Encrypt (free, auto-renewing).
6. **Environment variables** come from a `.env` file readable only by the service user,
   or — better — from **AWS Secrets Manager** or **SSM Parameter Store**, so secrets are
   never on disk in plaintext.

**Containerized variant.** Building a Docker image and deploying it to **ECS Fargate**
(no servers to manage) or **EKS** (Kubernetes) removes the need to configure the
instance by hand and makes the deployment reproducible. This is the more common
production shape today, and it is what an Infrastructure-as-Code definition (Terraform)
would provision.

| | |
|---|---|
| **Best for** | Organizations already on AWS; workloads needing VPC isolation, private networking, or compliance controls the platform vendor cannot provide |
| **Effort** | Substantial — networking, TLS, process supervision, patching, monitoring |
| **Cost** | Free tier covers a `t3.micro` for 12 months; RDS has a limited free tier |
| **Tradeoff** | Full control, full responsibility |

### Option C — Other managed platforms

**Railway, Render, Fly.io** occupy a middle ground: they run a container (not
serverless functions), often bundle a Postgres instance, and require less
configuration than EC2. Fly.io in particular runs the application close to users
geographically. These are reasonable if the serverless model is a poor fit but full
infrastructure ownership is unnecessary.

**AWS Amplify** and **Azure Static Web Apps** are the cloud vendors' equivalents of
the Vercel model, and are natural if the rest of the organization's stack is already
on that cloud.

### Domains

The deployed application is initially reachable at a platform-assigned subdomain (for
example `*.vercel.app`). Attaching a custom domain:

1. **Register a domain** through a registrar (Namecheap, Cloudflare, Route 53, and
   others). A `.com` typically costs roughly $10–15/year; some TLDs are cheaper.
2. **Point DNS at the application.** The platform provides the target records:
   - An **A record** (or the platform's ALIAS/ANAME) for the apex domain
     (`example.com`).
   - A **CNAME** for a subdomain (`app.example.com` → the platform's hostname).
3. **TLS is issued automatically** by Vercel, Netlify, and similar platforms once DNS
   resolves. On EC2, Certbot performs the equivalent step.
4. **Update `AUTH_URL`** to the custom domain and redeploy — Auth.js constructs its
   callback URLs from this value, so a stale value breaks sign-in.

DNS propagation is usually minutes, occasionally up to 48 hours.

### Keeping it private (intranet / internal-only)

A compliance tracker is exactly the kind of application an organization may not want
exposed to the public internet. Several approaches, in increasing order of isolation:

**1. Authentication only (current design).** The application is publicly reachable, but
every page and API route requires a valid session. Adequate for many internal tools,
though the login page itself is exposed to the internet.

**2. Network-level restriction.** On EC2, the security group can permit inbound traffic
only from the corporate IP range or VPN. Anyone outside cannot reach the application at
all — it does not merely reject them, it is unreachable. This is a meaningfully stronger
posture than application-level auth alone, because unauthenticated code paths are never
exposed.

**3. Fully private VPC.** The instance receives no public IP. It sits in a private
subnet, reachable only through a VPN connection into the VPC, or through AWS Client VPN
/ Site-to-Site VPN. Internal DNS resolves an internal hostname. Nothing is
internet-facing.

**4. Identity-aware proxy / zero trust.** Cloudflare Access, AWS Verified Access, or
Google IAP sit in front of the application and require an authenticated corporate
identity (SSO) before a request ever reaches it. This combines the reachability of
option 1 with an enforcement point outside the application, and is the common modern
answer for internal tools.

**Note on the platform choice:** Vercel's Hobby tier does not provide IP allow-listing,
so options 2–3 require a self-hosted or container deployment (EC2/ECS). This is a
genuine limitation of the serverless platform for internal, network-restricted
workloads — and the reason organizations with those requirements typically run this
kind of application inside their own VPC.

### Enterprise SSO

For internal deployment, credential-based sign-in would usually be replaced with the
organization's identity provider. Auth.js supports OIDC/SAML providers (Microsoft
Entra ID, Okta, Google Workspace) by adding a provider to `src/lib/auth.ts` — the rest
of the application, including all the ownership scoping, is unchanged, because it
depends only on `session.user.id`.

---
## 14. Design notes and limitations

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

## 15. Possible extensions

- **Tests** — unit tests for the Zod schemas and integration tests asserting that a
  user cannot read or modify another user's assets (the IDOR case is exactly what a
  test should pin down).
- **Organizations and RBAC** — a `Team` model so multiple users share assets, with
  roles (owner/editor/viewer) enforced server-side.
- **Audit trail** — an append-only log of who changed which check and when, which is
  itself a common compliance requirement.
- **Rate limiting** on `/api/register` and sign-in to blunt credential-stuffing.
- **Security headers** — Content-Security-Policy, HSTS, and X-Frame-Options via
  `next.config.ts`, hardening against XSS and clickjacking beyond the defaults.
- **Multi-factor authentication**, email verification, and a password-reset flow.
- **Enterprise SSO** — an OIDC/SAML provider (Entra ID, Okta) in place of credentials
  for internal deployment; no other code changes are required, since everything scopes
  on `session.user.id`.
- **Evidence attachments** — file uploads supporting each check.
- **Reporting** — export a framework-scoped compliance report as PDF or CSV.

---

## License

Released under the MIT License. See [LICENSE](LICENSE) for details.
