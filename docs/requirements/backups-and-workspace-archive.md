# Backups, workspace archive and data purge

Paste everything below the line into a new Claude Code chat in this repo.

---

Build backups, a downloadable workspace archive with re-import, and the purge of closed workspaces for Capabble. Read `CLAUDE.md` first and follow it (RBAC route rules, mail templates, design system, naming).

## Why

Our public privacy policy and terms (capabble-landing/src/content) now promise:

- Backups are overwritten within **30 days**.
- After a workspace closes, the school can export its data for **30 days**. We then delete it within a further **60 days** (90 days in all). Workspace account details are also kept 90 days after closing.
- Invoices and payment records are kept **8 years** (Indian tax law).
- Data is stored in India (AWS Mumbai), encrypted in transit and at rest.

Right now there's no backup system and nothing deletes a closed workspace. Settings → Account → Close workspace records `Tenant.closure` (`requestedAt`, `exportUntil`, `deleteAfter`, `canceledAt`) on the central Tenant model, but nothing acts on it yet.

## What exists

- MongoDB Atlas cluster: one central DB (`CENTRAL_DB_NAME`) and one DB per tenant (`TENANT_DB_PREFIX` + slug). Find out the cluster tier first. Free and shared tiers have little or no Cloud Backup, so we probably need our own dumps.
- Billing is on Neon Postgres (`BILLING_DATABASE_URL`). Check what point-in-time history the plan gives.
- Uploaded files are on Cloudinary (`server/src/config/cloudinary.js`). Check how files are grouped per tenant (folder or prefix).
- Server runs on EC2 (`cd server && npm ci`). Email goes through `server/src/utils/mailer.js` with templates in `server/src/mail/templates.js`.
- We run mostly on free or cheap resources, so keep the cost near zero and tell me any cost before adding it.

## Build

1. **Nightly backups.** Do a gzip `mongodump --archive` of the central DB and of every tenant DB, plus a `pg_dump` of billing unless Neon's history already covers 30 days. Encrypt each file (AES-256, or `age`) with a key from env that is never stored next to the backups. Upload it to object storage in India. AWS S3 `ap-south-1` is the default choice; suggest a cheaper option if there's one with an India region. A bucket lifecycle rule deletes backups after 30 days. Run it as a server job (follow the billing scheduler's lease pattern so only one instance runs it) or as EC2 cron, whichever fits better, and say which you chose. Email support@capabble.cloud when a backup fails.
2. **Restore.** Write a script that restores one tenant or the central DB from a chosen backup into a database name I give it, never over a live DB unless I pass an explicit flag. Add a short runbook to `server/docs` (or wherever ops docs live) and test a real restore into a scratch DB.
3. **Workspace archive (export).** When a closure is requested, and on demand by a school admin during the 30-day window, build a downloadable archive of that school. It holds the tenant DB dump, its Cloudinary files (or a manifest with signed URLs if that's too big), and a `manifest.json` with the schema/app version, slug, institution details and creation date. Give the admin an expiring signed download link by email and in Settings → Account. Say plainly in the UI that the school should keep this file and that it can be re-imported if they come back.
4. **Re-import.** Add a platform admin action (admin portal) that creates or reuses a tenant from an archive. It restores the DB, re-uploads files, runs our migrations (`migrate:rbac` and any others) and handles an archive from an older app version. Use a dry run by default and show a summary before applying.
5. **Purge.** Run a daily job for tenants whose `closure.deleteAfter` has passed and whose closure wasn't cancelled. It drops the tenant DB, deletes the tenant's Cloudinary files, removes its `TenantUserDirectory` entries and marks the Tenant as deleted. Keep only what's legally needed: billing records stay in Neon for 8 years. Write an audit entry for each purge. Each purge needs a platform admin's approval in the admin portal: the job lists what's due, and an admin approves it. Email support when a purge is due, and email the school admin 7 days before deletion.
6. **Docs.** Update `CLAUDE.md` (env vars, commands) and add tests for the purge selection logic, the archive manifest and the restore safety flag.

## Done means

- A nightly backup has run and I can see the encrypted files in the bucket with the 30-day rule on.
- I've seen a restore into a scratch DB work.
- A test tenant can be closed, archived, purged after its date (with a time override for testing), and re-imported from its archive with its data back.
- Nothing runs against production until I've reviewed it. Tell me the exact env vars and one-time setup steps for stage and production.
