# Dates are written by us, and every workspace route blocks

## What changed

Two console errors were coming out of the running product. Both are gone.

`packages/validation/src/zoned-time.ts` gained `clockIn`, `shortMoment` and
`dayLabel`. They read the wall clock through `wallClockIn`, which asks
`Intl.DateTimeFormat` only for numbers, then assemble the English wording from
two tables held in that file. `Moment` in `pipeline-overview.tsx` and
`EventMoment` on the client record now call them.

Every page under `apps/app/app/(app)` that reaches for a session now carries
`export const instant = false`, matching the ten pages that already did.

## Why

### The date

The landing screen threw a hydration error on every load. React reported the
server had written `Sun, 27 Sept, 13:00` where the browser wrote
`Sun 27 Sept, 13:00`. One comma.

`Intl.DateTimeFormat("en-GB", { weekday: "short", ... })` does not promise a
separator. The server runs its own ICU build and Chromium runs another, so the
same options produced two strings and React discarded the tree.

Asking for text from the platform and then requiring the two platforms to agree
is the defect. The fix is to stop asking. `wallClockIn` already converts an
instant into a zone's calendar date and clock using only numeric fields, which
every ICU build agrees on. Weekday and month names are three-letter English and
belong to us, so they are ours to spell. `packages/validation/test/zoned-time.spec.ts`
pins the output, including that a Dubai evening rolls into the next day and that
midnight reads `00:00` rather than `24:00`.

This does not weaken the timezone rule. Nothing here carries an offset: the
argument is still an IANA zone id, and the conversion still goes through the
platform's zone database.

### The route

Next.js 16 validates that a route can render instantly, and twelve routes failed
it in the dev console: *Could not validate `instant` because the target segment
was prevented from rendering*.

They all fail for the same reason. `requireSession()` reads the cookie and then
asks the API who the person is before the shell can be drawn. That is real I/O
above the Suspense boundary, so the navigation blocks on the server. This is a
CRM behind a sign-in; there is no version of these screens that renders
usefully without knowing who is asking.

`export const instant = false` is the documented opt-out for a route that
blocks — `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md`,
"Opting out". Ten pages already carried it. The remaining eighteen now do, so
the rule is uniform rather than a pattern half applied, and a route can be
taken off the list one at a time if its shell is ever made static.

It is set per page rather than once on `[slug]/layout.tsx` on purpose: a layout
opt-out would stop flagging navigations into the subtree, which would hide the
settings pages from validation as a group.

## How it is held

`apps/app/e2e/console.e2e.ts` signs in as an administrator, walks eighteen
routes and six client-record tabs at 375, 768, 1024 and 1440, and fails on any
console error, any uncaught page error and any response of 400 or worse.
