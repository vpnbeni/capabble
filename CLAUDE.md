# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product Vision

**CAPABBLE** is building a modular school/institution ERP — comparable metaphorically to AWS, where each service (module) is independently purchasable and works standalone, but modules seamlessly integrate when combined. Institutions can start with a single module and add more over time via one-click activation.

### Module Registry

Each module is fully functional as a standalone product and supports integration with other active modules.

#### Completed / Near-Complete
| Code | Name | Description | Status |
|------|------|-------------|--------|
| **CNTR** | Centre Management | CBSE examination centre operations: datesheet import, candidate management, seating plans, duty assignment, answer sheet tracking, Form 66 attendance, dispatch | Done |
| **TMTBL** | Timetable | School timetable generation: teacher-subject-class allocation, bell timings, parallel subjects, conflict resolution, version management | Done |
| **STDNT** | Student Management | Manage students | Near-complete |
| **EXMCL** | Internal Exams | Manage internal/class exams | Near-complete |
| **ASETS** | Asset Management | School physical asset lifecycle: ownership, locations, allocations, stock, maintenance, audits, disposal | Done |
| **CLNDR** | Calendar | A calendar on every dashboard (staff Home, crew screen, family portal) showing only what concerns the viewer: school days (weekly offs, holidays, vacations, half days, closures for some classes), school events with audience segments (each with its own instructions, part, notify level, email, reminders and replies: acknowledge / RSVP / consent per child), and dated items from active modules (exams, duties, fee dues, meetings, activities). Teacher events to families need the principal's approval. School days drive attendance, timetable busy periods, appointment slots, fee due dates (optional), payroll LOP and library due dates. Private phone-calendar feed per login. Features `clndr_calendar` / `clndr_events` are billed as core. Code in `server/src/modules/clndr`, plan in `docs/requirements/calendar-plan.md` | Done |
| **APPNT** | Appointments | Parent, visitor and staff meetings: opt-in hosts with weekly hours, front-desk booking and walk-ins, check-in, private notes, family-portal requests; uses timetable (teaching periods busy), attendance (absent hosts) and students (guardian prefill) when active. Off by default per tenant (`appnt_desk`); hosts get the `appointment_host` role | Done |

#### Planned
| Code | Name | Description | Status |
|------|------|-------------|--------|
| **STAAF** | Staff Management | Manage school staff | Planned |
| **ATTND** | Attendance | Manage attendance of staff | Planned |
| **CPITL** | Capital / Finance | Income (fee structures, collection, receipts, slips) + expenses (payroll with PF/ESI/PT, fuel per vehicle, electricity, operating costs, infra projects, budgets) | Done |
| **ACDMC** | Academic / Curriculum | Manage curriculum | Planned |
| **ACTVT** | Activities | Manage co-curricular activities | Planned |
| **TRNST** | Transport | Manage transport | Planned |
| **LBRY** | Library | School digital library | Planned |
| **LABBS** | Labs | School digital labs | Planned |
| **STTOK** | Store / Inventory | Manage inventory & store (consumables overlap with ASETS stock) | Planned |
| **CNTCT** | Communication Centre | Communication centre | Planned |
| **FDBCK** | Feedback | Suggestions & complaints | Planned |
| **ALMNI** | Alumni | School alumni (passout students) | Planned |

### Core Principles
1. **Module independence** — Each module works fully standalone. Subscribing to Timetable does not require Cntr, and vice versa.
2. **Shared kernel** — Core entities (Teacher, Student, Subject, Room, AcademicSession, User) live in a shared "core" layer accessible to all active modules.
3. **One-click integration** — When a tenant activates a new module, it automatically gets access to shared core data and can interoperate with other active modules.
4. **Data sovereignty per module** — Deleting a teacher from the Timetable module does NOT affect the Exam module. Each module maintains its own view/snapshot of shared entities.
5. **Modular monolith architecture** — Single deployable server, but code is organized into self-contained modules with well-defined boundaries, communicating via an internal event bus. Can evolve to microservices later if scale demands.

### Architectural Strategy: Modular Monolith + Shared Database
- **Single database per tenant** (not per module) — all modules share one tenant DB, with collections logically grouped by module ownership
- **Shared kernel collections** (core): `users`, `teachers`, `students`, `subjects`, `rooms`, `academic_sessions`
- **Module-owned collections**: each module owns its specific collections (e.g., exam owns `candidates`, `datesheets`, `seating_plans`; timetable owns `timetable_states`, `timetable_versions`)
- **Event-driven cross-module communication**: in-process event bus for decoupled module interaction (e.g., `core:teacher:deactivated` → each module reacts independently)
- **Soft-delete + local snapshots**: shared entities use soft-delete; modules snapshot shared data at point-in-time to maintain independence (TimetableState already does this with its local `teachers[]` array)
- **Lazy model registration**: only register Mongoose models for active modules per tenant (reduces memory footprint)
- **Module dependency declaration**: modules declare dependencies (e.g., `exam` depends on `core`); activating a module auto-enables its dependencies
- This approach is validated by Odoo, ERPNext, and Zoho — all use single-DB + module-scoped tables, not database-per-module

### Target Server Directory Structure (Evolution Goal)
```
server/src/modules/
  core/           # Shared kernel: Teacher, Student, Subject, Room, User, AcademicSession
    models/
    routes/
    controllers/
    services/
    events.js     # Defines events this module emits
  exam/           # Cntr — Exam centre management bounded context
    models/       # Candidate, DateSheet, SeatingPlan, AnswerSheet, DutyAssignment, Form66
    routes/
    controllers/
    services/
    listeners.js  # Subscribes to core events
  timetable/      # Timetable bounded context
    models/       # TimetableState, TimetableVersion
    routes/
    controllers/
    services/
    listeners.js
```

## Project Overview

CAPABBLE ERP is a multi-tenant, full-stack MERN application providing modular school/institution management. Completed modules: **CNTR** (CBSE examination centre management), **TMTBL** (school timetable generation), and **STDNT** (student management, near-complete). Next up: **EXMCL** (internal exams). The system uses a central platform database alongside per-tenant databases for data isolation, with feature toggles controlling module activation per tenant.

## Deployment & Domains

- **schol.capabble.localhost:5175** — Local SCHOL UI (`/schol` + `/school-intelligence` API on port 8001). Start with `npm run dev:schol`. Optional bare host `schol.capabble` via `schol/scripts/setup-local-host.ps1` (Windows, admin).
- **school.capabble.cloud** (stage: stageschool.capabble.cloud) — Production deployment of the `/client` app on Vercel (formerly cntr.capabble.cloud, which 301-redirects here via `client/vercel.json`). This is the main product website for "Cntr – Exam Centre Control".
  - `/` (root) → shows `CntrLanding` page (public marketing landing page) when not authenticated
  - `/login` → Login page
  - `/signup` → Signup / tenant onboarding
  - Authenticated users are redirected to `/dashboard` or `/select-session`
- **capabble.cloud** — `/capabble-landing` (Next.js) in this repo, deployed as its own Vercel project. This is the parent company (CAPABBLE) main website. Cntr is one of the products under CAPABBLE.

## Development Commands

```bash
# Start frontend + backend
npm run dev

# Start all three apps (server + client + admin)
npm run dev:all

# Start only backend (port 5000)
npm run server

# Start only frontend (port 5173)
npm run client

# Start only admin portal (port 5174)
npm run admin

# Install all dependencies (root, server, client, admin)
npm run install-all

# Build for production
npm run build            # Client
npm run build:admin      # Admin portal

# Start production server
npm start

# Seed database
npm run seed

# Run tests (server + client)
npm test

# Lint (server + client)
npm run lint

# Clean all node_modules and dist
npm run clean
```

### Client-specific (from /client)
```bash
npm run type-check    # TypeScript checking without emit
npm run lint          # ESLint
```

### Server-specific (from /server)
```bash
npm run test                          # Jest tests with watch mode
npm run lint:fix                      # ESLint with auto-fix
npm run seed:subjects                 # Seed subjects only
npm run bootstrap:platform            # Bootstrap platform admin + central DB
npm run platform:admin -- --email <new> --password --apply  # Change platform admin login/password (prompts; dry run without --apply)
npm run backfill:tenant-user-directory # Backfill tenant user directory
npm run backup:setup                  # Check backup storage + key, install the 30-day expiry rules
npm run backup:run                    # Back up central, every tenant DB and billing now (encrypted)
npm run backup:list                   # Backup runs in storage
npm run backup:restore -- --run=latest --db=tenant:<slug> --to=<scratch db>   # Never over a live DB without --overwrite-live
npm run workspace:archive -- --slug=<slug>    # Build a workspace archive and email the school admin
npm run workspace:lifecycle [-- --now=<date>] # Daily workspace job; --now needs WORKSPACE_CLOCK_OVERRIDE_ALLOWED=true (never prod)
```

### Backups, workspace archives and purges
- Code in `server/src/modules/dataLifecycle`, runbook in `server/docs/backups.md`, admin UI at admin portal → Workspace data.
- Nightly encrypted backups (central + every tenant DB + billing) and the daily workspace job run inside the API server with a lease in `job_leases`; both are off unless `BACKUP_ENABLED` / `WORKSPACE_LIFECYCLE_ENABLED` are `true`.
- Closing a workspace builds a downloadable archive (Settings → Account). Closed workspaces are deleted only after a platform admin approves the purge; billing records are never purged (kept 8 years).
- A new tenant data migration must be added to `TENANT_MIGRATIONS` in `importService.js` (accepting `--apply --tenant=<slug>`) so old archives still re-import. A new archive layout bumps `FORMAT_VERSION` in `archiveFormat.js` with an upgrade step.

## Architecture

### Monorepo Structure
- `/client` - React 18 + TypeScript + Vite frontend (port 5173)
- `/server` - Node.js + Express backend with MongoDB (port 5000). Billing (`server/src/modules/billing`) runs in the same server on its own Postgres database (Neon, Drizzle migrations); only that module touches it and money is integer paise. See its README
- `/admin` - React 18 + TypeScript + Vite admin portal (port 5174)
- `/schol` + `/school-intelligence` - SCHOL UI + Python API
- `/capabble-landing` - Next.js marketing site (capabble.cloud)
- `/mobile` - Expo (SDK 58) iOS/Android app for families and staff, the design system's Companion surface. Not a workspace (React 19 vs the web's 18): `cd mobile && npm install` with Node 22.13+. Reads `packages/shared` through Metro. Plan: `docs/requirements/mobile-app-plan.md` and `mobile-staff-plan.md`; rules: `mobile/AGENTS.md` (staff work happens in the app, not on the website; screens are sized for 360dp Android phones with larger text first)
- `/packages/shared` - `@capabble/shared`: code/data used by more than one app (e.g. `tenantFeatureCatalog.json`)

**npm workspaces + Turborepo**: `client`, `admin`, `schol`, `capabble-landing` and `packages/*` are workspaces sharing one root `package-lock.json` — run `npm install` from the root, never inside an app. `npm run build:all` / `npm run type-check` run through Turborepo.

`server` and `school-intelligence` are **not** workspaces (server deploys standalone to EC2 via `cd server && npm ci`). Server gets shared files as committed copies: edit `packages/shared`, then `npm run sync:shared`; `npm run lint` fails if the copy drifts.

Each frontend `vercel.json` has `ignoreCommand: npx turbo-ignore`, so a Vercel project only rebuilds when its app or a workspace it depends on changed.

### Multi-Tenancy

The system uses a **database-per-tenant** isolation strategy:

- **Central platform database** (`CENTRAL_DB_NAME`) — stores platform admins, tenant records, onboarding tickets, user directory
- **Tenant databases** (`TENANT_DB_PREFIX` + slug) — each tenant gets an isolated database with its own models
- **Tenant resolution** — tenants are resolved from the `x-tenant-slug` header or subdomain via `resolveTenantFromRequest.js`
- **Middleware chain**: `requestContextMiddleware` → `tenantContextMiddleware` (for tenant routes) or `platformContextMiddleware` (for admin routes)
- **Key files** in `/server/src/tenancy/`:
  - `tenantContextMiddleware.js` — resolves tenant and attaches scoped DB connection
  - `tenantConnectionManager.js` — manages MongoDB connections per tenant
  - `registerTenantModels.js` — registers Mongoose models on tenant connections
  - `provisionTenant.js` — creates new tenant databases and seeds initial data
  - `onboardingTicketService.js` — ticket-based self-service tenant signup with OTP
  - `requestContext.js` — AsyncLocalStorage-based request context

### Client Architecture
- **State**: Redux Toolkit with slices in `/client/src/redux/slices/` (auth, teacher, student, subject, datesheet, room, dispatch)
- **Data Fetching**: TanStack React Query (v5) for server state
- **Routing**: React Router v6 with HashRouter, protected routes in `/client/src/routes/`
- **API Layer**: Axios services in `/client/src/services/`
- **UI**: Tailwind CSS 3 with dark mode (class-based), Headless UI, Heroicons, Lucide React, Framer Motion, Recharts, react-hot-toast

### Server Architecture
- **Entry**: `server.js` (startup) → `app.js` (Express config)
- **Models**: 13 tenant-scoped Mongoose schemas in `/server/src/models/` (User, Teacher, Student, Candidate, Subject, DateSheet, CBSEDatesheet, Room, AnswerSheet, AnswerSheetDispatch, Form66, CalendarEvent, SchoolDayRule, FolderMapping) + 4 platform models in `/server/src/models/platform/` (PlatformAdmin, Tenant, TenantOnboardingTicket, TenantUserDirectory)
- **Routes**: 17 route files — 1 platform route (`adminRoutes`) + 16 tenant-scoped routes mounted via `tenantScopedRouter`
- **Validation**: Joi schemas in `/server/src/validations/`
- **File Processing**: Parsers in `/server/src/utils/` for CBSE PDFs, Form66, Excel files
- **PDF Generation**: Puppeteer (v24)
- **Email**: login, reset, invite and billing emails are sent from `no-reply@capabble.cloud` (Hostinger SMTP) by `/server/src/utils/mailer.js`. School emails (calendar events, and any future bulk school mail) never use it: they go through the school's mail outbox (`/server/src/mail/outbox.js`, leased worker, dedupe keys, retries, suppression list), sent from the school's own SMTP account (Settings → School email) or the events mailbox (`MAIL_EVENTS_*`) with a daily share per school. Build new emails as templates in `/server/src/mail/templates.js` (shared branded layout, logo attached inline, HTML + text) and add a sample to `samples.js`; never write inline HTML in a controller. `npm run mail:preview` / `mail:test` in `/server`

### API Endpoints

**Platform routes** (central control plane):
- `/api/admin` - Platform admin auth, tenant CRUD, onboarding ticket management

**Tenant-scoped routes** (all pass through `tenantContextMiddleware`):
- `/api/auth` - JWT authentication with refresh tokens
- `/api/teachers` - Exam functionaries
- `/api/students` - Student management
- `/api/candidates` - Candidate import (PDF/Excel) and management
- `/api/subjects` - Subject master data
- `/api/datesheets` - CBSE datesheet import
- `/api/centre-datesheet` - Centre-specific datesheet generation
- `/api/seating-plan` - Seating arrangement with PDF export
- `/api/rooms` - Room/hall management
- `/api/form66` - Form 66 attendance import
- `/api/answersheets` - Answer sheet inventory
- `/api/dispatch` - Answer sheet dispatch
- `/api/export` - PDF/Excel exports
- `/api/guidelines` - Centre examination guidelines
- `/api/dashboard` - Dashboard analytics

## Key Patterns

- Frontend uses path aliases: `@/components`, `@/pages`, `@/services`, `@/hooks`, `@/redux`, `@/utils`, `@/types`, `@/styles` (configured in tsconfig and vite.config)
- API calls proxy from Vite dev server (5173) to backend (5000)
- Authentication: tenant sessions are httpOnly cookies (`cb_at` access 15 min, `cb_rt` refresh rotated on use, path `/api/auth`); the web app never sees a token. Cookie-authenticated writes need the `X-Requested-With` header (the axios instance sends it). Separate platform JWT for platform admins.

### Access control (RBAC) — must follow for any new route or page
- Three kinds of login: `staff` (school panel, permissions from roles), `parent` and `student` (family portal at `#/portal`, read-only, only their linked students). No self sign-up: logins are created in Settings → Users and access (`/api/users`).
- Permissions live in `packages/shared/src/permissionCatalog.json` (`module.resource.action`, plus built-in role templates and route rules). Edit it there, then `npm run sync:shared`.
- Every tenant route goes through `server/src/rbac/gate.js`: deny by default. **A new route prefix needs a rule in the catalog's `routes`**, otherwise only administrators can call it (the `route coverage` test in `src/rbac/__tests__` fails). Finer checks: `requirePermission(...)` from `src/rbac/middleware`.
- "Own classes only" grants (`scope: 'assigned'`) must be enforced with `buildSectionFilter` / `requireSectionInScope` from `src/rbac/scope.js` on any endpoint that lists or changes class-section data.
- Client: hide what a role can't use with `usePermissions()` (`can`, `access`); pass `access` (not raw `featureToggles`) to `featureAccess` helpers. New pages map to a permission through the catalog's `features` (or `EXTRA_PATH_PERMISSIONS` in `constants/featureAccess.ts`).
- Existing tenants: run `npm run migrate:rbac` in `/server` (dry run) then `-- --apply` once after deploying.
- File uploads: Multer/express-fileupload with 10MB limit, Cloudinary for storage
- Security middleware: Helmet, rate limiting, mongo-sanitize, xss-clean, hpp
- CORS: Dynamic origin validation — allows `ROOT_APP_DOMAIN` subdomains + explicit `CLIENT_URL`/`CLIENT_URLS`
- Tenant header: Requests include `x-tenant-slug` to identify the target tenant

### Naming (must follow)
- The product and company name is **Capabble** (`capabble` in identifiers, package names, DB names, storage keys, folders, emails). Older names of this project are retired and must never be written again in code, copy, config, scripts or docs. `npm run check:names` (part of `npm run lint`) fails if they appear.

### Design system (must follow for any UI work)
- Before building or changing UI in `/client`, read `client/src/components/ui/DESIGN.md`. It is the condensed Capabble design system mapped to our kit (`@/components/ui`): voice, colour/status rules, component props, page recipes, and the patterns that were rejected.
- Don't fetch the design system artifact (claude.ai/artifact/LyYegFLHJxi1rNpnkaqHjH) for routine work. Open it only to resync `DESIGN.md` (asked by the user, or a needed piece isn't covered); then update `DESIGN.md` and its version line in the same change.
- Missing component or pattern: add it to the kit (`components/ui` + `styles/capabble`) in the system's style, document it in `DESIGN.md`, then use it.

### Dialogs & overlays (must follow — see `.cursor/rules/dialogs-and-overlays.mdc`)
- Always use the shared `@/components/common/Modal` or `@/components/common/Dialog`. Both render through `createPortal(…, document.body)`.
- Never render a `fixed inset-0` overlay inline in page JSX. The sticky header (`z-40`) sits outside the page's stacking context and paints over an inline overlay, leaving a **white strip at the top of the dialog**. Raising `z-index` on an inline overlay does not fix this.
- A custom overlay (drawer, sheet, lightbox) must portal to `document.body`, use `fixed inset-0 z-[100]` with an `absolute inset-0` backdrop inside it, lock body scroll, close on Escape, and set `role="dialog" aria-modal="true"`.
- Before finishing, open the dialog in the running app and confirm the backdrop dims the header area too, at desktop width and at 375px.

## Environment Variables

See `.env.example` (root and `/server`) for required variables:

**Database:**
- `MONGODB_URI` - MongoDB connection string (single cluster)
- `CENTRAL_DB_NAME` - Central platform database name
- `TENANT_DB_PREFIX` - Prefix for tenant databases

**Server:**
- `NODE_ENV`, `PORT`, `API_URL`
- `ROOT_APP_DOMAIN` - Root domain for subdomain-based tenant resolution
- `ROOT_API_DOMAIN` - Root API domain

**JWT (tenant):**
- `JWT_SECRET`, `JWT_EXPIRE`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRE`

**JWT (platform):**
- `PLATFORM_JWT_SECRET`, `PLATFORM_JWT_EXPIRE`
- `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`

**Public Signup:**
- `PUBLIC_SIGNUP_TICKET_TTL_MINUTES`, `PUBLIC_SIGNUP_EMAIL_OTP_TTL_MINUTES`, `PUBLIC_SIGNUP_EMAIL_OTP_MAX_ATTEMPTS`
- Rate limit settings for signup start, exchange, and OTP resend

**Email:** `SMTP_HOST` (smtp.hostinger.com), `SMTP_PORT` (465), `SMTP_SECURE` (true), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (`Capabble <no-reply@capabble.cloud>`), optional `MAIL_REPLY_TO`, `MAIL_SITE_URL`

**Cloudinary:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

**Calendar and school email:** `CALENDAR_JOBS_ENABLED` (scheduled publishing every minute, event reminders every 15 min), `MAIL_OUTBOX_ENABLED`, `MAIL_EVENTS_HOST` / `_PORT` / `_SECURE` / `_USER` / `_PASS` / `_FROM` (the events mailbox, e.g. `events@capabble.cloud`), `MAIL_EVENTS_DAILY_CAP_PER_TENANT` (300), `MAIL_CREDENTIALS_KEY` (32 bytes base64; encrypts schools' SMTP passwords, falls back to JWT_SECRET), `MAIL_LINK_SECRET` (unsubscribe links), `CLIENT_URL` (links in emails), `API_URL` (unsubscribe and calendar feed links)

**Online fee payments** (each school's own Razorpay account, Settings → Payments; code in `server/src/modules/cpitl/onlinePayments.js` + `publicPayments.js`, never the billing module): keys encrypted with `MAIL_CREDENTIALS_KEY`, `PAYMENT_LINK_SECRET` (signs the app's checkout links, falls back to JWT_SECRET), `API_URL` (webhook URL `/api/school-payments/webhook/<slug>` and the checkout page)

**School transport maps:** `ROUTING_URL` (OSRM server for the road between a route's stops, default the public `https://router.project-osrm.org`; `off` draws straight lines). The road is fetched once per set of stop positions and kept on the route (`roadPath`). Client `VITE_MAP_TILE_URL` / mobile `EXPO_PUBLIC_MAP_TILE_URL` override the map tiles

**Push notifications** (the Capabble app, `server/src/push`): `PUSH_OUTBOX_ENABLED` (default true; sends every in-app notification to the recipient's phones through Expo every 30 s), optional `EXPO_ACCESS_TOKEN` (only when enhanced push security is on in Expo)

**Backups and workspace data** (see `server/docs/backups.md`):
- `BACKUP_ENABLED`, `WORKSPACE_LIFECYCLE_ENABLED` - turn on the nightly backup / daily workspace job (default off)
- `BACKUP_STORAGE` (`s3` or `local`), `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION` (`ap-south-1`), optional `BACKUP_S3_ENDPOINT`, `BACKUP_LOCAL_DIR` (local driver), `BACKUP_PREFIX` (default: `CENTRAL_DB_NAME`)
- `BACKUP_ENCRYPTION_KEY` - 32 random bytes, base64 (`openssl rand -base64 32`); keep a copy in the password manager, never next to the backups
- `BACKUP_HOUR_IST` (default 2), `BACKUP_BILLING` (default true when `BILLING_DATABASE_URL` is set)
- `MONGODUMP_PATH`, `MONGORESTORE_PATH`, `PG_DUMP_PATH`, `PG_RESTORE_PATH` - only if the tools aren't on `PATH`
- `ARCHIVE_LINK_SECRET` (falls back to `JWT_SECRET`), `ARCHIVE_LINK_DAYS` (7), `ARCHIVE_MAX_FILES_MB` (500), `API_URL` (archive links), `ADMIN_URL` (purge email), `SUPPORT_EMAIL`
- `WORKSPACE_CLOCK_OVERRIDE_ALLOWED` - testing only, lets `workspace:lifecycle --now` pretend a later date; never set in production
- AWS credentials come from the EC2 instance role (or `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`)

**Client** (`/client/.env.example`):
- `VITE_ROOT_APP_DOMAIN`, `VITE_ROOT_API_DOMAIN`, `VITE_LOCAL_API_URL`, `VITE_API_URL`

## Default Dev Credentials
- Platform admin: admin.capabble / admin.capabble (`npm run bootstrap:platform` in `/server`)
- Tenant admin: admin@example.com / admin123
- Operator: operator@example.com / operator123
- Operator2: operator2@example.com / operator123
