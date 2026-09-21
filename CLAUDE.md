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

#### Planned
| Code | Name | Description | Status |
|------|------|-------------|--------|
| **STAAF** | Staff Management | Manage school staff | Planned |
| **ATTND** | Attendance | Manage attendance of staff | Planned |
| **CPITL** | Capital / Finance | Manage income & expenses | Planned |
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
- **cntr.capabble.cloud** — Production deployment of the `/client` app on Vercel. This is the main product website for "Cntr – Exam Centre Control".
  - `/` (root) → shows `CntrLanding` page (public marketing landing page) when not authenticated
  - `/login` → Login page
  - `/signup` → Signup / tenant onboarding
  - Authenticated users are redirected to `/dashboard` or `/select-session`
- **capabble.cloud** — Separate repo (`capabble-landing`) deployed on Vercel. This is the parent company (CAPABBLE) main website. Cntr is one of the products under CAPABBLE.

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
npm run backfill:tenant-user-directory # Backfill tenant user directory
```

## Architecture

### Monorepo Structure
- `/client` - React 18 + TypeScript + Vite frontend (port 5173)
- `/server` - Node.js + Express backend with MongoDB (port 5000)
- `/admin` - React 18 + TypeScript + Vite admin portal (port 5174)

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
- **Models**: 13 tenant-scoped Mongoose schemas in `/server/src/models/` (User, Teacher, Student, Candidate, Subject, DateSheet, CBSEDatesheet, Room, AnswerSheet, AnswerSheetDispatch, Form66, Calendar, FolderMapping) + 4 platform models in `/server/src/models/platform/` (PlatformAdmin, Tenant, TenantOnboardingTicket, TenantUserDirectory)
- **Routes**: 17 route files — 1 platform route (`adminRoutes`) + 16 tenant-scoped routes mounted via `tenantScopedRouter`
- **Validation**: Joi schemas in `/server/src/validations/`
- **File Processing**: Parsers in `/server/src/utils/` for CBSE PDFs, Form66, Excel files
- **PDF Generation**: Puppeteer (v24)
- **Email**: Nodemailer (`/server/src/utils/mailer.js`) for OTP and notifications

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
- Authentication: JWT with role-based access (Admin, Data Entry Operator) for tenants; separate platform JWT for platform admins
- File uploads: Multer/express-fileupload with 10MB limit, Cloudinary for storage
- Security middleware: Helmet, rate limiting, mongo-sanitize, xss-clean, hpp
- CORS: Dynamic origin validation — allows `ROOT_APP_DOMAIN` subdomains + explicit `CLIENT_URL`/`CLIENT_URLS`
- Tenant header: Requests include `x-tenant-slug` to identify the target tenant

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

**Email:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

**Cloudinary:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

**Client** (`/client/.env.example`):
- `VITE_ROOT_APP_DOMAIN`, `VITE_ROOT_API_DOMAIN`, `VITE_LOCAL_API_URL`, `VITE_API_URL`

## Default Dev Credentials
- Platform admin: admin.capabble / admin.capabble (`npm run bootstrap:platform` in `/server`)
- Tenant admin: admin@sems.com / admin123
- Operator: operator@sems.com / operator123
- Operator2: operator2@sems.com / operator123
