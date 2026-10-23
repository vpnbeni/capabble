# AWS EC2 + Nginx Deployment (Backend API)

This guide is for deploying only the Capabble backend (`server`) on AWS EC2 behind Nginx, with GitHub Actions CD.

## 1. Target architecture

- EC2 instance runs Node.js + PM2
- Nginx listens on `80/443`
- Nginx proxies `/api/*` and `/health` to Node on `127.0.0.1:5000`
- Frontends (`admin`, `client`) are deployed separately on Vercel

## 2. EC2 one-time setup

### 2.1 Install runtime

```bash
sudo apt update && sudo apt install -y nginx git
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
sudo apt install -y \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxrandr2 \
  xdg-utils
# If Ubuntu 24 reports missing `libasound2` / `libcups2`, install:
# sudo apt install -y libasound2t64 libcups2t64
```

The server needs Node 24 (`server/.nvmrc`). To move an existing box from Node 20: run the
NodeSource `setup_24.x` line and `sudo apt install -y nodejs` again, then in the app directory
`npm ci --omit=dev`, `sudo npm i -g pm2`, `pm2 update` and `pm2 restart all --update-env`.
Check with `node -v` and `pm2 logs`.

### 2.2 Create app directory

```bash
sudo mkdir -p /var/www/capabble/server
sudo chown -R $USER:$USER /var/www/capabble
```

### 2.3 Nginx config

Reference template in repo:

- `deploy/nginx/capabble-api.conf`

Create `/etc/nginx/sites-available/capabble-api.conf`:

```nginx
server {
    listen 80;
    server_name api.example.com;

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /health {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and reload:

```bash
sudo ln -sf /etc/nginx/sites-available/capabble-api.conf /etc/nginx/sites-enabled/capabble-api.conf
sudo nginx -t
sudo systemctl reload nginx
```

### 2.4 TLS

Use Certbot after DNS points to EC2:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.example.com
```

## 3. Backend environment variables on EC2

Create `/var/www/capabble/server/.env` (example):

```env
NODE_ENV=production
PORT=5000

MONGODB_URI=<mongo-uri>
CENTRAL_DB_NAME=examination_management_system
TENANT_DB_PREFIX=capabble_tenant_

API_URL=https://api.example.com/api
ROOT_API_DOMAIN=api.example.com
ROOT_APP_DOMAIN=app.example.com
CLIENT_URL=https://admin.example.com
CLIENT_URLS=https://admin.example.com,https://app.example.com

JWT_SECRET=<strong-secret>
JWT_REFRESH_SECRET=<strong-secret>
JWT_EXPIRE=7d
JWT_REFRESH_EXPIRE=30d

CLOUDINARY_CLOUD_NAME=<value>
CLOUDINARY_API_KEY=<value>
CLOUDINARY_API_SECRET=<value>
```

## 4. GitHub Actions CD workflow

Workflow file:

- `.github/workflows/deploy-backend-ec2.yml`

Required GitHub repository secrets:

- `EC2_HOST`
- `EC2_USER`
- `EC2_SSH_PRIVATE_KEY`
- `EC2_APP_DIR` (example: `/var/www/capabble/server`)

Optional secrets:

- `EC2_SSH_PORT` (default `22`)
- `EC2_SERVICE_NAME` (default `capabble-server`)

What the workflow does:

1. Installs server dependencies in CI.
2. Creates a release tarball of `server/`.
3. Uploads tarball to EC2 over SSH.
4. Extracts into `EC2_APP_DIR`.
5. Runs `npm ci --omit=dev`.
6. Runs `npm run billing:db:migrate` (billing's Postgres; skip if `BILLING_DATABASE_URL` is not set).
7. Restarts app using PM2 (`ecosystem.config.js`).

## 5. PM2 bootstrap (first time only)

On EC2 once:

```bash
cd /var/www/capabble/server
npm ci --omit=dev
npm run billing:db:migrate
pm2 start ecosystem.config.js --only capabble-server --update-env
pm2 save
pm2 startup
```

Run the printed command from `pm2 startup` to enable boot persistence.

## 6. Validate

```bash
curl -i http://127.0.0.1:5000/health
curl -i https://api.example.com/health
curl -i https://api.example.com/api
```

## 7. Notes

- Keep frontends off this server (Vercel handles them).
- Rotate all secrets previously exposed in screenshots.
- If deploy fails, check PM2 logs:

```bash
pm2 logs capabble-server --lines 200
```
