# LIBRY production readiness

## Deployment

LIBRY uses the existing tenant-scoped Mongoose connections. No migration command is required: model indexes are created by the existing model-registration lifecycle. Before enabling the `libry_catalogue` feature for a production tenant, ensure its tenant database user can create indexes.

Start the platform as usual with `npm run dev:core` for local server/client work. Run `npm run sync:shared` after changing a shared permission or tenant-feature catalog.

## Operational safeguards

- All LIBRY records are registered through the tenant model registry; model access therefore remains inside the active school's database connection.
- A loan issue uses a database transaction and a conditional copy-status update, preventing two requests from issuing an available copy simultaneously.
- Copy status changes follow the explicit lifecycle in `server/src/modules/libry/lifecycle.js`.
- Lending duration and maximum active loans come from the persisted lending policy; the system does not apply a hard-coded policy.
- Fine settlement is deliberately not implemented. A fine can be assessed or waived, but it must not be marked paid until a supported finance integration provides an authorized settlement confirmation.
- Digital resources accept HTTPS links only. Private-file storage is not connected because this repository does not expose a reusable private-storage grant interface for LIBRY.

## Verification

Run focused tests:

```powershell
npm --prefix server exec jest src/modules/libry/__tests__/lifecycle.test.js --runInBand
npm --prefix client run type-check
```

The LIBRY lifecycle test covers due-date calculation, lending eligibility, copy transition validation, fine caps, and deterministic reservation ordering. Database-backed API integration and concurrent-request tests require a disposable MongoDB replica-set test environment; the repository does not currently provide one, so they are not claimed as executed here.

## Recovery

Library history is tenant data. Restore the tenant database from the platform's normal MongoDB backup procedure, then restart the server so the tenant connection manager re-registers all LIBRY models. Do not delete completed loans, fines, receipts, or audit rows as a correction mechanism.
