# Capabble billing service

Sells Capabble modules to schools: catalog and prices, trials, subscriptions, GST invoices,
Razorpay payments, receipts, credit notes and reminders. It is the only thing that reads or
writes the billing database (Postgres, e.g. Neon). The ERP server and the platform admin talk
to it over `/internal/*`, keyed by the school's tenant slug or id.

## Run

```bash
cd billing-service
npm install
cp .env.example .env        # set DATABASE_URL / DATABASE_URL_UNPOOLED to a development branch
npm run db:migrate          # applies drizzle/*.sql over the direct (unpooled) URL
npm run db:seed             # module list; add -- --sample-prices on development branches only
npm run dev                 # port 5100
npm test                    # in-memory Postgres (PGlite); no database or network needed
```

Schema changes: edit `src/db/schema.js`, then `npm run db:generate` and commit the new SQL file.
Guards Drizzle can't express (price overlap, locked invoices, append-only audit log) are in
`drizzle/0001_guards.sql`.

## How billing works

- **Pricing:** each module has a price per month and per year that covers up to N students
  (default 500), plus a rate for each student above N. Bundles discount a set of modules.
  Coupons (percent or fixed, once / repeating / forever) apply after the bundle. Add-ons are
  extra lines. Price changes add a new version; issued invoices keep their price.
- **Students billed:** the higher of the count the school declares and the live count of
  active students from the ERP (when the Students module is on).
- **Lifecycle:** `trialing` (every module) → `active` once paid → `past_due_grace` when a
  renewal or invoice is unpaid → `suspended_read_only` after the grace days.
  `grandfathered` is complimentary access for existing schools. `canceled` is read-only.
  `src/domain/stateMachine.js` holds the rules; the hourly job and every entitlement read apply them.
- **GST:** 18% per line. CGST 9% + SGST 9% when the school's place of supply (GSTIN state,
  else billing address state) equals `BILLING_SUPPLIER_STATE_CODE`, otherwise IGST 18%.
  Invoice, credit note and receipt numbers are gapless per financial year (April–March):
  `CB2627-000001`, `CN2627-000001`, `RC2627-000001`.
- **Money** is always integer paise. Every change that must land together (invoice and lines,
  payment and receipt and subscription state) is one transaction with an audit entry.

## Endpoints

- `GET /health`: includes database reachability and latency.
- `POST /webhooks/razorpay`: HMAC-verified. Each Razorpay event id is stored once. A
  processed event is never applied twice; a failed one is retried when Razorpay retries.
  Payments are also unique per Razorpay payment id.
- `/internal/*` (header `x-billing-service-token`):
  - `GET entitlements/:slug`: the contract the server's `billingEntitlement` middleware reads
    (`accessMode`, `state`, `entitledModules`, …).
  - `tenants/onboard`, `tenants/grandfather`.
  - `tenant/:slug` (summary, catalog, invoices, payments, credit notes, PDFs, subscription
    preview/subscribe/cancel/resume, pay-now and reconcile, profile).
  - `admin/*` (schools, change plan, extension, offline payment, void, credit note with refund,
    auto-debit, audit log, catalog editing, `jobs/run`).
  - Callers pass `x-billing-actor-type` / `x-billing-actor-id` for the audit log.

## Neon

- Use the pooled URL for the app and the direct URL for migrations.
- Neon suspends idle computes. The pool waits up to 10s to connect, and connection errors
  are retried with backoff (whole transactions, never single statements). `/health` and boot
  wake the database.
- The hourly job coordinates through a lease row (`billing.job_leases`), which works through
  the pooler, so several instances can run safely.
- Develop on a Neon branch. Migrating the production branch is a deliberate step.

## Rolling out to an environment

1. Deploy billing-service, run `npm run db:migrate`, then `npm run db:seed` and set prices in
   the platform admin (Prices and plans).
2. In `server/`, run `npm run billing:grandfather` (dry run), then add `-- --apply`. Existing
   schools get complimentary access, so they aren't read-only on day one.
3. Set the Razorpay webhook to `https://<billing host>/webhooks/razorpay` with the events
   `payment_link.paid`, `payment.captured`, `payment.failed`, `refund.processed`,
   `refund.failed` and `subscription.*`.
4. Turn on `BILLING_ENFORCEMENT_ENABLED` on the server.
