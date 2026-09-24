# Business lines

Decided with the product owner. This document is the decision, not a proposal.

---

## 1. One platform, two business lines

| Line | `Vertical` | What it is |
| ---- | ---------- | ---------- |
| Trading Academy | `ACADEMY` | Lead → Qualified → Mentor assigned → Converted → Student. Programmes, enrolments, tuition deposits. |
| Real Estate | `REAL_ESTATE` | Contacts, owners, properties. Listings, viewings, deals. |

Everything the two lines share is built once: identity and roles, the person
record, the pipeline machinery, activities, money, ingestion, data quality,
search, automation, audit.

Everything that differs is per line: the domain entities and the pipeline
stages. Programmes and enrolments belong to the academy. Properties, owners and
opportunities belong to real estate. Neither exists in the other.

Real-estate modules are **planned, not built**. `REAL_ESTATE` exists in the
schema so the column does not have to be added to a populated table later.

## 2. `vertical` is not a tenant id

It says which pipeline a record is being worked in. It does not partition
people. §3 outranks it.

## 3. One human is one row, in every line

A person who owns a flat and enrols on a course is one `client` row with one
permanent `clientRef`. Not two rows. Not one row per line.

This is the rule the whole product hangs on, and it is the rule most easily
broken by a well-meant "just add a row for the other line".

## 4. Where the boundary is enforced

| Layer | Mechanism |
| ----- | --------- |
| Who may work a line | `staffProfile.verticals`. An `ADMIN` gets every line implicitly and stores none. |
| One place decides | `packages/db/src/access.ts` — `verticalsOf`, `canAccessVertical`, `clientScope`. No procedure may test a role or a line for itself. |
| Every read | `clientScope(actor, vertical)` builds the `where`. A procedure that writes its own filter is a defect. |
| Every write | `canEditClient` and `canAccessFinancials`, both of which fail closed on the line before they look at ownership. |
| The database | `client_vertical_status` refuses an academy-only status on a real-estate record. |

The lesson that produced the single-source rule: an earlier build fixed the
reader and left the writer testing `role !== 'admin'` on its own. Finance saw
both lines in the menu and the click was refused in silence. One module, two
call sites, no test that compared them.

## 5. Status per line

| Status | `ACADEMY` | `REAL_ESTATE` |
| ------ | --------- | ------------- |
| `LEAD` | yes | yes |
| `QUALIFIED` | yes | yes |
| `MENTOR_ASSIGNED` | yes | no |
| `CONVERTED` | yes | yes |
| `STUDENT` | yes | no |
| `LOST` | yes | yes |
| `DORMANT` | yes | yes |

`client_mentor_required` asks for a mentor on the academy side only.
`client_conversion_chain` asks both lines for `convertedById` and `convertedAt`.

---

## Open decisions

1. **A person active in both lines at once.** `client.vertical` holds one line
   per row. A person who is a student and is also buying a flat has one
   pipeline state, not two. If both are needed at the same time, the pipeline
   state moves to a `clientPipeline` table keyed `(clientId, vertical)` and
   `client.vertical` becomes the line last worked. That is a migration, not a
   rewrite, but it is cheaper before the table carries data. **Raise before
   the real-estate modules are built.**
2. **Who sets `staffProfile.verticals`.** Users admin is module 10. Until it is
   built, every profile carries the `ACADEMY` default and only an admin can
   reach real estate.
3. **`clientRef` across lines.** One sequence, one ref per human, whichever
   line entered them. The ref does not say which line, and it should not.

---

## Deposits

The ledger is the same table for both lines. `deposit.clientId` carries the
business line through `client.vertical`, so a reader who works one line never
reaches the other's money, and no deposit row stores a line of its own.
