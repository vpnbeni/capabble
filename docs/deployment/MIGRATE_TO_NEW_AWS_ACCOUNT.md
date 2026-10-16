# Migrating capabble-server / capabble-stage to a New AWS Account

**Why:** The current AWS account ("Vipin", `413368290841`, ap-south-1) is on the free plan, which
ends 2026-07-28 (~$37 credit left). `capabble-server` and `capabble-stage` need to move to the "Amoura"
AWS account (`459640517815`) before then. `amoura-server` and `capabble-api` on the old box are
unrelated apps and are **out of scope** — do not touch them.

**Region decision:** New instance in **ap-south-1 (Mumbai)** under the Amoura account — not
co-located on the existing eu-north-1 `amoura` instance — to avoid a latency regression for
India-based tenants (billing config is INR / Asia-Kolkata). This is a brand new, separate EC2
instance in the Amoura account.

**Database:** MongoDB Atlas (external, managed) — no data migration needed. Only the Atlas
Network Access allowlist needs to gain the new instance's IP.

This is a step-by-step runbook. Follow it in order; the old instance stays untouched and running
until step 10 is verified, so you always have a rollback.

---

## 0. Prerequisites

- [ ] AWS CLI configured with a profile for the Amoura account (`aws configure --profile amoura`),
      since your local `default` profile currently points at the Vipin account.
- [ ] SSH access to the **old** box (`capable`, `i-07b7ae21eb75e3033`, ap-south-1) to pull real
      secrets and discover `capabble-stage`'s config.
- [ ] Access to your DNS provider for whatever zone hosts `api.capabble.cloud` (or the real
      current API domain — see step 1.2).

---

## 1. Discovery on the OLD box (do this first, before anything else)

SSH into the current `capable` instance and capture what's not in git.

### 1.1 Find `capabble-stage`'s actual config

Only `capabble-server` has an `ecosystem.config.js` in the repo — `capabble-stage` isn't documented
anywhere. Reconstruct it:

```bash
pm2 describe capabble-stage
pm2 show capabble-stage        # script path, cwd, port, env
cat /path/to/capabble-stage/.env   # wherever pm2 describe says its cwd is
```

Write down: script path, working directory, `PORT`, and any env vars that differ from
`capabble-server`'s.

### 1.2 Confirm the real domain/nginx config in use

The repo's `deploy/nginx/capabble-api.conf` is a generic template (`api.example.com`). Check what's
actually live:

```bash
cat /etc/nginx/sites-enabled/*.conf
sudo certbot certificates      # shows the real domain(s) with active certs
```

### 1.3 Pull the real `.env` files

```bash
# from your local machine
scp ubuntu@<old-ip>:/var/www/capabble/server/.env ./capabble-server.env.bak
scp ubuntu@<old-ip>:<capabble-stage-path>/.env ./capabble-stage.env.bak
```

These contain `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PLATFORM_JWT_SECRET`,
`CLOUDINARY_*`, `SMTP_*`, `RAZORPAY_*`, `BILLING_SERVICE_TOKEN`. They only exist on this box —
they are gitignored and were never committed.

### 1.4 Check for local file storage

```bash
du -sh /var/www/capabble/server/uploads 2>/dev/null
```

If non-trivial, you'll need to `rsync`/`scp` this directory too (Cloudinary is used for most
uploads per `.env`, so this may be empty/small — confirm rather than assume).

---

## 2. Provision the new EC2 instance (Amoura account, ap-south-1)

```bash
aws ec2 run-instances \
  --profile amoura --region ap-south-1 \
  --image-id <ubuntu-24.04-ami-id-for-ap-south-1> \
  --instance-type t3.micro \
  --key-name <new-keypair-name> \
  --security-group-ids <sg-id> \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=capabble-server}]'
```

- [ ] Security group: allow inbound 22 (SSH, ideally restricted to your IP), 80, 443. Do **not**
      open 5000 publicly — Nginx proxies to it over loopback.
- [ ] Allocate and associate an **Elastic IP** so the public IP never changes again after this
      migration (avoids repeating the DNS-cutover pain next time you resize/restart).
- [ ] Ubuntu 24.04 to match the old box (same OS the existing docs/scripts assume).

---

## 3. Install runtime on the new box

Follow `docs/deployment/AWS_DEPLOYMENT.md` §2.1–2.2 verbatim (Node 20, PM2, Nginx, Puppeteer
system deps, `/var/www/capabble/server` app directory). Also create a directory for `capabble-stage`
using whatever path you found in step 1.1.

---

## 4. Deploy the code

```bash
cd /var/www/capabble
git clone <repo-url> capabble-server-src   # or scp a release tarball if repo is private without deploy keys set up
cd capabble-server-src/server
npm ci --omit=dev
```

Repeat for `capabble-stage` if it runs from a different checkout/branch (check what you found in
step 1.1 — it may just be the same repo checked out twice, or a different branch/commit).

Copy the `.env` files pulled in step 1.3 into place (`/var/www/capabble/server/.env`, and the
`capabble-stage` equivalent) — **do not** recreate them from `.env.example`, since the example has
placeholder secrets, not the real ones.

---

## 5. MongoDB Atlas network access

- [ ] In Atlas → Network Access, add the new instance's **Elastic IP** to the allowlist.
- [ ] Leave the old instance's IP in place until step 10 is confirmed working (rollback safety).
- [ ] Remove the old IP only after decommissioning the old instance (step 11).

---

## 6. Start PM2 on the new box

```bash
cd /var/www/capabble/server
pm2 start ecosystem.config.js --only capabble-server --update-env
# then capabble-stage, using the config reconstructed in step 1.1
pm2 save
pm2 startup     # run the printed command to enable boot persistence
```

---

## 7. Nginx + TLS on the new box

Use the real domain(s) found in step 1.2 (not the `api.example.com` placeholder) when adapting
`deploy/nginx/capabble-api.conf`. Enable the site, then once DNS points here (step 9):

```bash
sudo certbot --nginx -d <real-api-domain>
```

Certbot can't be run successfully until DNS resolves to this box — that's why this is last.

---

## 8. Pre-cutover smoke test (before touching DNS)

Test directly against the new box's IP without waiting for DNS:

```bash
curl -i http://<new-elastic-ip>/health          # via Nginx, if you temporarily allow the IP in server_name
# or simplest: SSH in and curl the loopback
ssh ubuntu@<new-elastic-ip> "curl -i http://127.0.0.1:5000/health"
```

Also worth: temporarily add `<new-elastic-ip> <real-api-domain>` to your local machine's
`/etc/hosts` and hit the real domain from a browser to catch TLS/CORS issues before the real
DNS cutover — remove the hosts-file entry afterward.

---

## 9. DNS cutover

- [ ] Lower the TTL on the `api.capabble.cloud` (or real domain) A record an hour or so ahead of
      time if your current TTL is high, so the cutover propagates fast.
- [ ] Update the A record to the new Elastic IP.
- [ ] Watch `dig +short <real-api-domain>` from a few networks/tools (or a propagation checker)
      until it resolves to the new IP everywhere you care about.

---

## 10. Post-cutover verification

- [ ] `curl -i https://<real-api-domain>/health` and `/api` from outside.
- [ ] Log into the actual client app (`school.capabble.cloud` / `school.capabble.cloud`, whichever is
      live — see the domain-model note below) and exercise a real flow: login, load a tenant
      dashboard, one write action.
- [ ] Watch `pm2 logs capabble-server capabble-stage --lines 200` on the new box for errors during first
      real traffic.
- [ ] Confirm CORS still works — `CLIENT_URL`/`CLIENT_URLS`/`ROOT_APP_DOMAIN` in the copied `.env`
      must match whatever frontend origin is actually calling this API.

> **Domain-model discrepancy found during exploration:** `PROJECT_OVERVIEW.md` describes
> subdomain-based tenant resolution via `school.capabble.cloud`, while `server/.env.example` and
> CLAUDE.md describe a newer single-URL model at `school.capabble.cloud`. Confirm which is actually
> live in production before assuming which client origin needs to keep working post-cutover.

---

## 11. Decommission the old instance (only after 24–48h stable on the new box)

- [ ] Remove the old instance's IP from the MongoDB Atlas allowlist.
- [ ] `pm2 stop capabble-server capabble-stage` on the old box (leave `amoura-server`/`capabble-api`
      running — out of scope).
- [ ] Terminate the old EC2 instance (or leave the Vipin account running until its free-tier
      window naturally closes on 2026-07-28, as a passive rollback, if the $37 credit covers it).

---

## 12. Recreate monitoring

`docs/deployment/AWS_CLOUDWATCH_MONITORING.md` already documents this for a fresh instance.
Follow it against the **new** instance ID/hostname — CloudWatch alarms don't carry over, and that
doc explicitly calls out that a new instance means new hostname-based metric dimensions.

---

## Open items not required for migration, but worth deciding later

- `.github/workflows/deploy-backend-ec2.yml` is referenced in `AWS_DEPLOYMENT.md` but doesn't
  exist — CD to EC2 is currently manual (`git pull` + `pm2 restart` or a full redeploy). If you
  want to build this, `EC2_HOST`/`EC2_SSH_PRIVATE_KEY` secrets will need updating to point at the
  new box regardless.
- `deploy-aws.sh` (Elastic Beanstalk) and `render.yaml` (Render.com) are legacy/unused deploy
  paths still sitting in the repo — fine to ignore during this migration, but candidates for
  cleanup later.
