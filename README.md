# Trading Academy CRM

Operations platform for a premium trading academy. Company base: Dubai, UAE.
Company timezone: `Asia/Dubai`. Design language: **Dubai Financial Command
Center**.

The product is specified in [`docs/product/`](./docs/product/). Read the
relevant document before you change the area it covers.
[`docs/product/STACK_MAPPING.md`](./docs/product/STACK_MAPPING.md) says how that
specification maps onto this codebase, what is built, and what is next.

## The one rule that matters

**One human = one row = one permanent Client ID (`CL-000184`).**

Lead and Student are statuses of that row, not separate records. Conversion is
an update, never an insert. Every client carries who created it, who owns it in
sales, who mentors it, who converted it and when.

## Modules (v1)

Dashboard · Market globe · Leads · Clients · Sales team · Mentors · Students ·
Programs · Deposits · Company calendar · Tasks · Users and roles · Settings ·
Audit log.

Out of scope for v1: communication center, trading support, trade execution,
broker integration, trading signals, advanced analytics, social features.

## The stack

A [Turborepo](https://turborepo.dev) monorepo on [Bun](https://bun.com).

| | |
| --- | --- |
| **Front end** | [Next.js](https://nextjs.org) App Router · shadcn/ui from `packages/ui` · nuqs for URL state |
| **API** | [NestJS](https://nestjs.com) with nestjs-trpc — HTTP, auth, tRPC, mailbox sync |
| **Data** | [Prisma](https://prisma.io) · PostgreSQL · optional Redis |
| **Auth** | [Better Auth](https://better-auth.com) — Google, Microsoft, or your own IdP; one allow-list |
| **Agent** | `apps/agent` on [eve](https://eve.dev) — durable sessions, tools, skills, schedules |
| **Tooling** | Biome · TypeScript everywhere |

### Layout

| Path | |
| --- | --- |
| `apps/app` | Next.js front end · :3000 |
| `apps/api` | NestJS API — HTTP, auth, tRPC, mailbox sync · :3001 |
| `apps/agent` | The research agent — tools, skills, schedules, sandbox |
| `packages/db` | Prisma schema, migrations, shared Postgres client |
| `packages/auth` | Better Auth config and the sign-in allow-list |
| `packages/ui` | shadcn/ui components, the Tailwind theme |
| `packages/validation` | Zod schemas for every shape that crosses a package boundary |
| `docs/product` | The product specification: architecture, database, authorization, design, tests |
| `docs/` | Engineering docs for each area of the codebase |

## Quick start

You need [Bun](https://bun.com) and Docker.

```sh
cp .env.example .env          # then fill in the values below
bun install

docker compose up -d          # Postgres on :5432

bun run db:deploy             # apply migrations
bun run db:seed               # optional: demo data
bun run dev
```

The app is on [localhost:3000](http://localhost:3000), the API on
[localhost:3001](http://localhost:3001).

### The values to set

| Variable | What to put in it |
| --- | --- |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `ALLOWED_SIGN_IN` | Your email domain, or one address. Unset means nobody can sign in. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | A Google OAuth client. Both or neither. |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | A Microsoft Entra app registration. Both or neither. |

Pick at least one of Google and Microsoft. [`docs/setup.md`](./docs/setup.md)
walks through both. Everything else in [`.env.example`](./.env.example) is
optional, and the app runs without it.

## Tasks

| Command | |
| --- | --- |
| `bun run dev` | Prepare the local database, then run everything in watch mode |
| `bun run build` | Build all apps and packages |
| `bun run test` | Run the test suite (needs the Docker Postgres) |
| `bun run check-types` | `tsc --noEmit` everywhere |
| `bun run lint` / `format` | Biome |
| `bun run lint:slop` | oxlint |
| `bun run db:migrate` | Create and apply a migration |
| `bun run db:seed` | Top up the demo data (idempotent) |
| `bun run db:studio` | Prisma Studio |
| `bun run --filter=api trpc:generate` | Regenerate the `AppRouter` type |
| `bun run --filter=api dev:session` | Print a session cookie for a local user |

## Working rules

The rules for anyone, human or agent, who changes this repository are in
[`AGENTS.md`](./AGENTS.md). Shipping mechanics are in
[`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Origin

This codebase started from an MIT-licensed open-source CRM base. The notice is
retained in [`LICENSE`](./LICENSE). The product, the domain model and the
design language are this project's own.
