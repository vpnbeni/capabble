# Backups, workspace archives and purges — runbook

Code: `server/src/modules/dataLifecycle/`. Admin UI: admin portal → **Workspace data**.

What our privacy policy and terms promise, and what does it:

| Promise | How |
|---|---|
| Backups are overwritten within 30 days | Bucket lifecycle rule expires `<prefix>/backups/` after 30 days (`npm run backup:setup` installs it) |
| Data in India, encrypted in transit and at rest | S3 bucket in `ap-south-1` (Mumbai). Backups are AES-256-GCM encrypted on the server before upload (`BACKUP_ENCRYPTION_KEY`), and S3 also encrypts at rest (SSE-S3). TLS everywhere |
| After closing, 30 days to export | Archive built when closure is requested; admins can make new ones in Settings → Account until `exportUntil`. The daily job sets the tenant to `closed` after that |
| Deleted within a further 60 days | Daily job opens a purge request when `closure.deleteAfter` passes and emails support. A platform admin approves it in the admin portal. School admins are emailed 7 days before |
| Invoices kept 8 years | The purge never touches billing (Postgres). `npm run tenant:purge` (testing tool) does, so never run it on a real school |

## Where things are

Everything for one environment sits under one prefix (default: the central DB name, e.g. `sems_central/` for production, `stage_sems_central/` for stage), so stage and production can share a bucket:

```
<prefix>/backups/<IST day>/<run id>/manifest.json           plain: what each file holds, checksums, app version
<prefix>/backups/<IST day>/<run id>/central.archive.gz.enc  mongodump --archive --gzip, encrypted
<prefix>/backups/<IST day>/<run id>/tenant-<slug>.archive.gz.enc
<prefix>/backups/<IST day>/<run id>/billing.pgdump.enc      pg_dump --format=custom, encrypted
<prefix>/archives/<slug>/<archive id>.zip                    workspace archive (school download), 100-day safety expiry
<prefix>/imports/<day>/<id>.zip                             archives uploaded for re-import, 7-day expiry
```

Central records: `backup_runs`, `workspace_archives`, `workspace_purges` (the purge audit trail), `workspace_imports`, `job_leases`.

## Jobs

Both run inside the API server on EC2 (not Vercel). They tick every 15 minutes and take a lease in `job_leases`, so with several instances only one runs, once per IST day:

- **Nightly backup** (`BACKUP_ENABLED=true`): first tick after `BACKUP_HOUR_IST` (default 2 am). Up to 3 tries a day. Every failure (whole run, or one database) emails `SUPPORT_EMAIL`.
- **Daily workspace job** (`WORKSPACE_LIFECYCLE_ENABLED=true`): first tick after 7 am IST. It builds missing closure archives, closes workspaces whose export window ended, sends the 7-day deletion notices and opens purge requests. It never deletes anything.

We chose a server job over EC2 cron: it reuses the app's DB connection, mailer and env, and the lease pattern (same as billing's `job_leases`) makes it safe with more than one instance. It does need the MongoDB Database Tools and the Postgres client on the server (see setup).

## One-time setup (per environment)

1. **Install the tools on EC2** (Amazon Linux 2023):
   ```bash
   sudo dnf install -y https://fastdl.mongodb.org/tools/db/mongodb-database-tools-amazon2023-x86_64-100.13.0.rpm
   sudo dnf install -y postgresql17   # pg_dump must be >= the Neon server's major version
   mongodump --version && pg_dump --version
   ```
2. **Bucket** (once, shared by stage and production): S3 → Create bucket, region **Asia Pacific (Mumbai) ap-south-1**, Block all public access ON, default encryption SSE-S3, versioning OFF (versions would outlive the 30-day promise).
3. **Access**: attach an IAM role to the EC2 instance (preferred, no keys in `.env`) with this policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Action": ["s3:ListBucket", "s3:GetLifecycleConfiguration", "s3:PutLifecycleConfiguration"],
         "Resource": "arn:aws:s3:::BUCKET" },
       { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"],
         "Resource": "arn:aws:s3:::BUCKET/*" }
     ]
   }
   ```
   Without a role, set `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` for an IAM user with the same policy.
4. **Encryption key**: `openssl rand -base64 32`. Put it in the server `.env` as `BACKUP_ENCRYPTION_KEY` **and** in the team password manager. Never store it in the bucket or in git. Without it, backups cannot be read. Use a different key for stage and production.
5. **Env** (server `.env`), then restart:
   ```
   BACKUP_ENABLED=true
   WORKSPACE_LIFECYCLE_ENABLED=true
   BACKUP_STORAGE=s3
   BACKUP_S3_BUCKET=<bucket>
   BACKUP_S3_REGION=ap-south-1
   BACKUP_ENCRYPTION_KEY=<from step 4>
   ARCHIVE_LINK_SECRET=<openssl rand -base64 32>   # signs archive download links (falls back to JWT_SECRET)
   API_URL=https://api.capabble.cloud/api           # used in archive links (stage: stageapi…)
   ADMIN_URL=https://admin.capabble.cloud           # link in the purge-due email
   SUPPORT_EMAIL=support@capabble.cloud
   ```
6. `cd server && npm run backup:setup` — checks the key, writes and deletes a probe file, installs the expiry rules and prints them.
7. `npm run backup:run` once, then `npm run backup:list`, then do a test restore (below). Check the S3 console shows the `.enc` files and the lifecycle rule `<prefix>-backups-30d`.

## Restore

Always restore into a **new** database name first, look at it, then decide.

```bash
cd server
npm run backup:restore -- --list
npm run backup:restore -- --run=latest --db=tenant:<slug> --to=restore_<slug>_<date>
npm run backup:restore -- --run=<run id> --db=central --to=restore_central_<date>
npm run backup:restore -- --run=latest --db=billing --to-url=postgres://…/restore_billing
```

The script refuses a target that is a live database (central, any tenant's DB, the billing DB) or that already has data. `--overwrite-live` lifts that and drops existing collections. Use it only for disaster recovery, after taking a fresh backup, with the server stopped or the tenant suspended.

**Lost one school's data:** restore into a scratch name, check it (compare counts with `manifest.json` of a recent workspace archive or with what the school reports), then either copy the needed collections back, or suspend the tenant and restore over it with `--overwrite-live`.

**Lost the central database:** the restore script still works (it reads `manifest.json` from storage, not the DB). Restore central into a new name, point `CENTRAL_DB_NAME` at it, restart.

**Lost the cluster:** create a new cluster, `--uri=<new cluster>` for central and each tenant (same names), update `MONGODB_URI`.

The key: restoring needs the same `BACKUP_ENCRYPTION_KEY` that made the backup (the file header says if it doesn't match). When rotating the key, keep the old one for 30 days.

## Workspace archives (school download)

- Built automatically when an admin requests closure; school admins can make more in Settings → Account while the export window is open. Platform admins can make one for any closing school (Workspace data → Closing workspaces).
- The school gets an email with a signed link (7 days, `ARCHIVE_LINK_DAYS`). Settings → Account shows fresh one-hour links.
- Contents: `manifest.json`, `database.archive.gz` (mongodump of the tenant DB), `files/` (Cloudinary uploads found by scanning the tenant DB for Cloudinary URLs; above `ARCHIVE_MAX_FILES_MB`, default 500, the rest are listed as links), `README.txt`. Format is versioned (`archiveFormat.js`).

## Re-import (school comes back)

Admin portal → Workspace data → Re-import: upload the school's `.zip` (or pick an archive we still hold). The dry run shows the archive's version, the target workspace (created, or reused when it exists with an empty database, e.g. after a purge), counts, files and warnings. Nothing is written until you type the workspace code and start the import. It then restores the DB, uploads files again (keeping ones still on Cloudinary) and rewrites their URLs, rebuilds the user directory, runs `TENANT_MIGRATIONS` (today: `migrate:rbac`), and opens the workspace. Staff sign in again with their old passwords. Billing is not in the archive: check the school's billing account afterwards.

When adding a tenant data migration, add it to `TENANT_MIGRATIONS` in `importService.js` (it must accept `--apply --tenant=<slug>`), so old archives keep importing.

## Purge (deleting a closed workspace)

1. The daily job opens a purge request when `closure.deleteAfter` passes and the closure wasn't cancelled, and emails support.
2. A platform admin opens Workspace data → Deletion approvals → Review: it lists the database, record and file counts, and the files kept because another school or the central DB uses them.
3. Typing the workspace code and approving deletes: the school's Cloudinary files, the tenant DB, its user-directory rows and onboarding tickets, its stored archives; the Tenant is marked `deleted` and its admin email cleared. Billing stays.
4. The purge record keeps who approved it, when, and the counts (the audit entry).

Backups taken before the purge still hold the school's data until they expire (30 days), which the policy allows.

## Testing a full cycle (stage or local only)

```bash
# 1. In the app, close a test workspace (Settings → Account → Close workspace). Its archive is emailed.
# 2. Pretend 91 days have passed (needs WORKSPACE_CLOCK_OVERRIDE_ALLOWED=true, never in production):
WORKSPACE_CLOCK_OVERRIDE_ALLOWED=true npm run workspace:lifecycle -- --now=<deleteAfter + 1 day>
# 3. Admin portal → Workspace data → approve the purge.
# 4. Admin portal → Workspace data → Re-import the archive .zip.
```

## Costs

At today's size (all databases ≈ 40 MB), 30 nightly encrypted dumps are about 0.3 GB: S3 Standard in Mumbai is about $0.025/GB-month, so well under ₹10 a month including requests. Transfer from EC2 to S3 in the same region is free; downloads of archives by schools are billed as S3 egress (~$0.11/GB), which is small.
