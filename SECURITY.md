# Security Policy

## Reporting a vulnerability

Report privately through **Security → Report a vulnerability** on this
repository. Do not open a public issue.

Include the revision, your configuration, the impact, and the steps to
reproduce it. If it involves real client data, describe the shape of it. Do not
paste it.

## What this is, and what it assumes

This CRM is built for **one academy of authenticated internal users**. It is not
a public or multi-tenant service boundary.

**Sign-in is the front door.** `ALLOWED_SIGN_IN` decides who gets in. An unset
value fails closed: nobody can sign in. A list that names a consumer domain is
an open door, which is why single addresses are supported.

**Client visibility is the core authorization rule.** The product specification
in [`docs/product/PERMISSIONS.md`](./docs/product/PERMISSIONS.md) says a client
record is visible to an admin, to its assigned sales owner, and to its assigned
mentor. Nobody else. The current codebase does **not** enforce this yet: every
signed-in user can read every record. See
[`docs/product/STACK_MAPPING.md`](./docs/product/STACK_MAPPING.md) for the
plan. Until that lands, do not put real client data in a deployment shared by
people who must not all see it.

**Operators can read everything.** Whoever runs the deployment has the
database, the environment and the logs.

**The agent reads mail.** Gmail and Outlook access is a condition of signing in
with those providers. The research agent reads message bodies, meeting attendees
and signature blocks. If you deploy this, you are the data controller for those
mailboxes.

**Outbound calls send data to third parties.** Each optional key in
`.env.example` turns on a vendor the agent can query. With no keys set, nothing
leaves your infrastructure except the identity provider's own APIs.

**The sync route is guarded by a shared secret.** `CRON_SECRET` is the whole
guard. Treat it like a password.

**Session cookies depend on one shared value.** Rotating `BETTER_AUTH_SECRET`
signs everyone out.

## Deploying it safely

- Set `ALLOWED_SIGN_IN` to a domain you control. Never a public mail provider.
- Generate `BETTER_AUTH_SECRET` yourself. The value in any example file is not a secret.
- Serve both processes over HTTPS. Secure cookies switch on with `NODE_ENV=production`.
- Set `CRON_SECRET` if you expose the sync route at all.
- Keep the database off the public internet.
- Start with no optional API keys and add them one at a time.

## Supported versions

`main` is the only supported branch. There are no backports.
