# The landing screen shows the academy, not the deal funnel

## What changed

`/[slug]` renders `PipelineOverview` against a new `overview.summary` procedure. The
six files that made up the old screen are gone: `dashboard-summary.tsx`,
`sales-dashboard.tsx`, `dashboard-charts.tsx`, `overview-greeting.tsx`,
`overview-scope.tsx`, `overview-search-params.ts`.

## Why the old one was a problem

The workspace held 36 clients, 23 deposit entries totalling AED 334,000 and four
programmes. The landing screen showed four KPI cells reading `$0` and `—`, then four
panels each holding one sentence saying there was nothing to see. It was reading the
base product's deal funnel, which this business does not use: the Trading Academy
sells to people, not accounts, and `STACK_MAPPING.md` §3 says so in as many words.

It was also the wrong shape. The figures rendered in the sans face at 13px
sentence-case labels, while `/deposits` two clicks away rendered the same class of
figure in Geist Mono at 11px uppercase with `--accent` marking the primary cell — the
pattern `DESIGN_SYSTEM.md` §3 and §6 actually specify. The first screen after sign-in
contradicted the rest of the product.

## What it does instead

One rail of four cells — people in the pipeline, converted this month, studying now,
money taken this month — then Needs you, Coming up, Where everybody is, and Latest
moves. Every figure is scoped by `clientScope(actor)`, so a salesperson sees their own
book, a manager sees their team's, an admin and finance see the company. The money cell
is absent for anyone without `deposits.view`, which is the mentor side; the cell says
so rather than showing a zero.

The KPI cell itself moved to `packages/ui/src/components/kpi-rail.tsx`, so the
overview and the deposits ledger are now one component rather than two that drift.

## What it breaks

Nothing that was reachable. `/companies`, `/contacts` and `/deals` keep their list
pages and their place in the rail.

`dashboard.summary` stays in the API. It summarises the B2B modules, which still
exist, and `apps/api/test/currency-totals.integration.spec.ts` uses it to prove that
deal totals convert correctly across currencies. It has no screen until those modules
either get one or retire together under the ADR that `STACK_MAPPING.md` §6.12 asks
for. Deleting it now would delete that currency coverage with it.

The `scope` search parameter (`?scope=me|everyone`) is gone. The overview scopes
itself from the actor's role, which is what `PERMISSIONS.md` §10 describes, and a
salesperson could never see anyone else's numbers through it anyway.
