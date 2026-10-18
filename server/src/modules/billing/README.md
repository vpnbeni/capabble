# Billing module

Sells Capabble modules to schools: catalog and prices, trials, subscriptions, GST invoices,
Razorpay payments, receipts, credit notes and reminders. It runs inside the server but keeps
its data in its own Postgres database (Neon), set by `BILLING_DATABASE_URL`. Only this
folder reads or writes that database. The rest of the server uses what `index.js` exports
and mounts its routers; nothing else imports from inside this folder.

## Set up

From `server/`:

```bash
# server/.env: BILLING_DATABASE_URL (pooled) and BILLING_DATABASE_URL_UNPOOLED (direct),
# pointing at a Neon development branch, never production.
npm run billing:db:migrate        # applies migrations/*.sql over the direct URL
npm run billing:db:seed           # module list; add -- --sample-prices on development branches only
npm run test:billing              # in-memory Postgres (PGlite); no database or network needed
```

Without `BILLING_DATABASE_URL` the server still starts: billing routes answer 503 and every
school has full access.

Schema changes: edit `db/schema.js`, run `npm run billing:db:generate`, and commit the new SQL
file. Guards Drizzle can't express (price overlap, locked invoices, append-only audit log)
are in `migrations/0001_guards.sql`.

## How it plugs into the server

| Where | What |
|---|---|
| `/api/billing/me/*` (`routes/schoolRoutes.js`) | One school's billing. `src/routes/billingRoutes.js` checks the session and sets the school, the actor and the live student count. |
| `/api/admin/billing/*` (`routes/adminRoutes.js`) | Platform admin. Mounted in `src/routes/adminRoutes.js` after the admin check. |
| `/api/webhooks/razorpay` (`routes/webhookRoutes.js`) | Mounted in `src/app.js` before the body parsers and sanitizers, because the signature is over the raw body. |
| `getEntitlement(slug)` | Read by `src/middleware/billingEntitlement.js`, which caches it and switches off unpaid modules. |
| `onboardTrial`, `grandfather` | Called at signup and by `npm run billing:grandfather`. |
| `setStudentCounter`, `startScheduler` | Wired in `src/server.js`. |

## How billing works

- **Pricing:** each module has a price per month and per year that covers up to N students
  (default 500), plus a rate for each student above N. Bundles discount a set of modules.
  Coupons (percent or fixed; once, repeating or forever) apply after the bundle. Add-ons are
  extra lines. A price change adds a new version; issued invoices keep their price.
- **Students billed:** the higher of the count the school declares and its live count of
  active students (when the Students module is on).
- **Lifecycle:**
  - `trialing`: every module is open.
  - `active`: once paid.
  - `past_due_grace`: a renewal or other invoice is unpaid.
  - `suspended_read_only`: the grace days have passed.
  - `grandfathered`: complimentary access for existing schools.
  - `canceled`: read-only.

  The rules are in `domain/stateMachine.js`. The hourly job and every entitlement read
  apply them.
- **GST:** 18% per line. If the school's place of supply (its GSTIN state, else its billing
  address state) equals `BILLING_SUPPLIER_STATE_CODE`, the tax is CGST 9% + SGST 9%;
  otherwise IGST 18%.
- **Document numbers** are gapless per financial year (April–March): `CB2627-000001`
  (invoice), `CN2627-000001` (credit note) and `RC2627-000001` (receipt).
- **Money** is always integer paise. Every change that must land together (an invoice and
  its lines; a payment, its receipt and the subscription state) is one transaction with an
  audit entry.
- **Webhooks:**
  - Each Razorpay event id is stored once.
  - A processed event is never applied twice; a failed one runs again when Razorpay retries.
  - A payment is also unique per Razorpay payment id.

## Neon

- Use the pooled URL for the app and the direct URL for migrations.
- Neon suspends idle computes:
  - The pool waits up to 10s to connect.
  - Connection errors are retried with backoff. A whole transaction is retried, never a
    single statement.
  - Server startup pings the database without waiting for it.
- The hourly job coordinates through a lease row (`billing.job_leases`). That works through
  the pooler, so every server instance can run the scheduler safely.

## Rolling out to an environment

1. Set the `BILLING_*`, `RAZORPAY_*` and supplier variables in `server/.env`, then deploy.
2. Run `npm run billing:db:migrate` and `npm run billing:db:seed`, then set prices in the
   platform admin (Prices and plans).
3. Run `npm run billing:grandfather` (a dry run), then again with `-- --apply`. Existing
   schools get complimentary access, so they aren't read-only on day one.
4. In Razorpay, point the webhook at `https://<api host>/api/webhooks/razorpay` with these
   events: `payment_link.paid`, `payment.captured`, `payment.failed`, `refund.processed`,
   `refund.failed` and `subscription.*`.
5. Turn on `BILLING_ENFORCEMENT_ENABLED`.
