# CAPABBLE ERP — Project Overview

> Last updated: June 2026 · Audience: Senior engineers, technical investors, new team members

---

## Table of Contents

1. [Project Architecture](#1-project-architecture)
2. [Module Map](#2-module-map)
3. [Database Schema Summary](#3-database-schema-summary)
4. [API Surface](#4-api-surface)
5. [Exam Management Module Deep Dive (CNTR)](#5-exam-management-module-deep-dive-cntr)
6. [Internal Exams Module (EXMCL)](#6-internal-exams-module-exmcl)
7. [Timetable Module Deep Dive (TMTBL)](#7-timetable-module-deep-dive-tmtbl)
8. [Inter-module Dependencies](#8-inter-module-dependencies)
9. [Frontend Structure](#9-frontend-structure)
10. [Admin Portal](#10-admin-portal)
11. [Deployment Architecture](#11-deployment-architecture)
12. [What Makes This Project Non-Obvious](#12-what-makes-this-project-non-obvious)

---

## 1. Project Architecture

### Vision

CAPABBLE is a **modular school/institution ERP** built on the principle that institutions should be able to purchase and activate individual modules — like AWS services — and have them work standalone *and* integrate seamlessly when combined. The first production module is **CNTR** (CBSE Exam Centre Control).

### Repository Structure

```
/
├── client/          # React 18 + TypeScript + Vite  (port 5173)
├── server/          # Node.js + Express + MongoDB    (port 5000)
├── admin/           # React 18 + TypeScript + Vite  (port 5174)  — platform ops portal
├── capabble-landing/# Next.js 15 — company marketing site (separate repo/deploy)
└── docs/            # Architecture docs
```

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS 3, React Router v6 (HashRouter) |
| State | Redux Toolkit + redux-persist (auth/core slices), TanStack React Query v5 (server state) |
| UI Libraries | Headless UI, Heroicons, Lucide React, Framer Motion, Recharts |
| Backend | Node.js 16+, Express 4, nodemon (dev) |
| Database | MongoDB via Mongoose 8 |
| Multi-tenancy | Database-per-tenant isolation (separate MongoDB DB per school) |
| Auth | JWT (access + refresh tokens), bcryptjs, HttpOnly cookies |
| File Handling | express-fileupload + Cloudinary (storage), Multer-compatible |
| PDF | Puppeteer 24 (render HTML → PDF), pdf-parse (import), pdf-lib (merge/stamp), pdf-to-img + Tesseract.js (OCR on imports) |
| Excel | ExcelJS |
| Email | Nodemailer (SMTP) |
| Queue | BullMQ + ioredis (attendance async processing) |
| Security | Helmet, express-rate-limit, express-mongo-sanitize, xss-clean, hpp |
| Validation | Joi (server), Yup + react-hook-form (client) |
| Testing | Jest + Supertest (server), Vitest-compatible (client) |
| Admin | React 18 (minimal framework — custom SPA routing via history API) |

### Architectural Pattern: Modular Monolith

The server is a **single deployable unit** with code organized into self-contained modules. Each module:
- Owns its Mongoose models
- Registers its own Express routes
- Declares which platform events it listens to
- Can be activated/deactivated per tenant via feature toggles

This mirrors the approach used by Odoo, ERPNext, and Zoho — proven at SaaS scale without the microservices complexity overhead.

---

## 2. Module Map

### Module Registry

| Code | Name | Status | Server Module | Feature Group |
|---|---|---|---|---|
| **core** | Shared Kernel | Always active | `modules/core` | auth, teachers, subjects, rooms, sessions, dashboard, billing, export |
| **CNTR** | Exam Centre Management | Production | `modules/cntr` | Centre Details, Centre Records |
| **TMTBL** | Timetable | Production | `modules/timetable` | School Hub |
| **EXMCL** | Internal Exams | In development | _(routes in cntr module)_ | ExmCl group |
| **ATTND** | Attendance | In development | `modules/attnd` | Attendance Hub |
| **STAAF** | Staff Management | Planned | — | Staff Hub |
| **STDNT** | Student Management | Near-complete | — | — |

### Module Activation Model

Each tenant record in the platform database stores a `featureToggles` map (e.g., `{ timetable_classes: true, seatingplan: false, ... }`). On every request:

1. `tenantContextMiddleware` reads feature toggles
2. `getActiveModelKeys()` computes which Mongoose models to register (only loads models for active modules)
3. `requireTenantFeature('key')` middleware guards individual routes
4. The client reads `user.featureToggles` and shows/hides sidebar items accordingly

This means a tenant paying only for CNTR never has timetable model overhead in memory.

### How Modules Connect

Modules communicate exclusively through an **in-process event bus** (`server/src/events/eventBus.js`):

```
core:teacher:deactivated  →  timetable listener (removes teacher from timetable state)
core:teacher:deleted      →  timetable listener (hard-removes teacher)
core:teacher:updated      →  timetable listener (syncs teacher name)
core:subject:updated      →  (future: sync to timetable state)
exam:seatingplan:generated → duty listener (triggers supervision history rebuild)
timetable:generated       →  (future: academic calendar hooks)
```

The bus wraps Node.js `EventEmitter` with `setImmediate` dispatch (non-blocking — API response returns before listener runs) and per-listener try/catch isolation.

---

## 3. Database Schema Summary

### Two-Tier Database Strategy

```
Central Platform DB (CENTRAL_DB_NAME)
├── PlatformAdmin          — super-admin credentials
├── Tenant                 — all schools/institutions (slug, dbName, featureToggles, status)
├── TenantOnboardingTicket — time-limited OTP-verified signup tokens
├── TenantUserDirectory    — cross-tenant user lookup
├── MasterSubject          — platform-managed subject catalog (rolled out to tenants)
├── MasterCBSEDatesheet    — platform-managed official CBSE datesheet
├── MasterGuideline        — platform-managed guidelines PDFs
├── MasterUndertaking      — platform-managed undertaking forms
├── MasterRemunerationRate — platform-managed remuneration rates
├── MasterSchoolDirectory  — school directory
├── MasterTeacherTemplate  — teacher template data
├── MasterPackingDispatch  — packing/dispatch instructions
├── DataRollout            — tracks platform→tenant data push jobs
├── SchoolDirectoryTypeSettings
└── TenantFeatureDefaults

Per-Tenant DB (TENANT_DB_PREFIX + slug)
├── CORE ENTITIES (always loaded)
│   ├── User               — tenant users (Admin, Data Entry Operator roles)
│   ├── Teacher            — exam functionaries / school teachers
│   ├── Subject            — subject catalog (synced from platform)
│   ├── Room               — exam rooms/halls
│   ├── AcademicSession    — "2025-2026" etc. (scopes all data)
│   ├── CBSEDatesheet      — CBSE exam schedule (rolled from platform)
│   ├── Calendar           — school calendar
│   ├── Feedback           — user feedback
│   ├── SupportTicket      — help desk tickets
│   ├── OnboardingSession  — onboarding wizard state
│   └── SchoolProfile      — school metadata
│
├── CNTR MODULE
│   ├── Student            — school students
│   ├── Candidate          — CBSE exam candidates (imported from PDF/Excel)
│   ├── DateSheet          — centre-specific datesheet (derived from CBSEDatesheet)
│   ├── AnswerSheet        — answer sheet inventory (serial ranges per class/type)
│   ├── AnswerSheetDispatch — dispatch records
│   ├── FolderMapping      — folder-to-serial mappings
│   ├── CBSECircular       — CBSE official circulars
│   ├── Form66             — attendance import records (Form 66 PDFs)
│   ├── Form66Upload       — upload metadata
│   ├── Guideline          — centre guidelines
│   ├── Undertaking        — undertaking forms
│   ├── CentreDetail       — centre identity (name, number, address)
│   ├── SeatingPlanTemplateSetting — per-exam seating display config
│   ├── SeatingPlanAllocation — persisted rollNo→room mapping per exam date (Rule 1 enforcement)
│   ├── DutyAllocationSetting — duty rotation config
│   ├── DutyAssignment     — teacher→room duty for an exam date
│   ├── DutySelection      — teacher self-selection records
│   ├── AttendanceRecord   — candidate exam-day attendance (from Form 66 or manual)
│   └── AttendanceUpload   — upload metadata
│
├── EXMCL MODULE (Internal Exams — extends CNTR models + adds:)
│   ├── ExamCircular       — internal exam circulars
│   ├── ExamDefinition     — exam definition (name, code, max marks, display order)
│   └── ExamResult         — student marks per exam, stored as Map<subjectName, marks>
│
├── TIMETABLE MODULE
│   ├── TimetableState     — single-document-per-session: classes[], subjects[], teachers[],
│   │                        teacherSubjectAllocations[], parallelSubjectPairs[], commonPeriods[],
│   │                        periodAllocation{}, timetableGrid{}, bellTimings{}
│   ├── TimetableVersion   — snapshots of published timetables
│   └── BellTimingVersion  — snapshots of published bell timing schedules
│
└── ATTND MODULE
    ├── StaffAttendanceDaily  — daily staff attendance records
    └── StudentAttendanceDaily — daily student attendance records
```

### Key Design Decisions

**1. Academic Session Plugin** — A Mongoose plugin applied to every significant model. It auto-injects the current academic session (from `AsyncLocalStorage` request context) into every query and `save`. Controllers don't need to pass session filters manually. Legacy records without a session field are included via `$or` fallback.

**2. Context Model Proxy** — Every tenant model is exported as a `Proxy` object. When `Candidate.find({...})` is called, the proxy looks up the active tenant connection from `AsyncLocalStorage` and routes to the correct per-tenant model. This means tenant isolation is transparent to all controllers.

**3. SeatingPlanAllocation as a persistence cache** — The seating plan generator writes each `rollNo → roomNo` mapping to this collection after generation. This enables cross-exam room conflict checking (CBSE Rule 1: same candidate can't sit in the same room twice) without re-generating all previous seating plans.

**4. TimetableState as a single document** — Instead of normalized tables, the entire timetable configuration (classes, teachers, allocations, grid) lives in one document per academic session. The timetableGrid is stored as `Mixed` — a 3-level nested object `{ classId → day → periodIndex → { subject, teacher } }`. This trades normalization for simplicity; the grid is small enough (typically <200KB) to fit comfortably.

---

## 4. API Surface

### Platform Routes (`/api/admin/*`)
Served only when request hits the root API domain or localhost.

| Route | Purpose |
|---|---|
| `POST /api/admin/auth/login` | Platform admin login |
| `GET /api/admin/tenants` | List all tenants |
| `POST /api/admin/tenants` | Create tenant |
| `PATCH /api/admin/tenants/:id/status` | Suspend/activate |
| `GET/POST /api/admin/features` | Manage tenant feature toggles |
| `POST /api/admin/rollouts` | Push master data (subjects, datesheet, guidelines) to all tenants |
| `POST /api/admin/rollouts/:id/retry` | Retry failed rollout tenants |
| `GET/POST /api/admin/master-subjects` | Manage platform subject catalog |
| `GET/POST /api/admin/master-datesheet` | Manage platform CBSE datesheet |
| `GET/POST /api/admin/master-guidelines` | Manage platform guidelines |
| `GET/POST /api/admin/master-undertakings` | Manage platform undertakings |
| `GET/POST /api/admin/remuneration-rates` | Manage platform remuneration rates |
| `GET/POST /api/admin/billing/*` | Billing catalog and tenant billing status |
| `GET/POST /api/admin/school-directory` | School directory management |

### Tenant-Scoped Routes (all under `/api/`)
All pass through: `tenantContextMiddleware → billingEntitlementMiddleware → academicSessionMiddleware`

**Core Module:**
| Route | Guard | Purpose |
|---|---|---|
| `/auth/*` | None | Login, logout, refresh, forgot/reset password |
| `/teachers/*` | `exam_functionaries` | Exam functionaries CRUD |
| `/subjects/*` | `subjects` | Subject CRUD + bulk import |
| `/rooms/*` | `examrooms` | Room/hall CRUD |
| `/sessions/*` | None | Academic session management |
| `/onboarding/*` | None | Multi-step onboarding wizard |
| `/dashboard/*` | `dashboard` | Analytics aggregations |
| `/billing/*` | `billing` | Billing status, subscription info |
| `/export/*` | None | PDF/Excel export endpoints |
| `/support/*` | `help_support` | Support ticket creation |

**CNTR Module:**
| Route | Guard | Purpose |
|---|---|---|
| `/candidates/*` | `candidates` | Candidate import (PDF/Excel), CRUD, re-import comparison |
| `/students/*` | `candidates` | Student CRUD |
| `/datesheets/*` | `datesheets` | CBSE datesheet management |
| `/centre-datesheet/*` | `datesheets` | Centre-specific filtered datesheet |
| `/answersheets/*` | `answersheets` | Answer sheet inventory (serial ranges) |
| `/dispatch/*` | `answersheets` | Answer sheet dispatch slips |
| `/form66/*` | `form66` | Form 66 attendance import + PDF export |
| `/seating-plan/*` | `seatingplan` | Generate, view, export seating plans |
| `/duties/*` | `duties` | Duty assignment (auto/manual) |
| `/guidelines/*` | `centre_guidelines` | Centre guideline PDFs |
| `/undertakings/*` | `undertaking` | Undertaking form management |
| `/cbse-circulars/*` | `cbse_circulars` | CBSE circular storage |
| `/centre-details/*` | `centre_details` | Centre identity management |
| `/attendance/*` | `attendance` | Exam day candidate attendance |
| `/remuneration/*` | `remuneration` | Teacher remuneration calculation |
| `/exam-circulars/*` | `exmcl_centre_guidelines` | EXMCL circulars |
| `/exam-definitions/*` | `exmcl_exams` | Internal exam definitions |
| `/exam-results/*` | `exmcl_exams` | Student exam results (marks entry) |
| `/report-card/*` | `exmcl_exams` | Report card generation |
| `/school-profile/*` | None | School profile |

**Timetable Module:**
| Route | Guard | Purpose |
|---|---|---|
| `/timetable/*` | `timetable_classes` | Full timetable CRUD + AI generation + export |

**Attnd Module:**
| Route | Guard | Purpose |
|---|---|---|
| `/attnd/*` | _(feature-gated per endpoint)_ | Staff and student daily attendance |

---

## 5. Exam Management Module Deep Dive (CNTR)

CNTR is the flagship module, handling the entire lifecycle of a CBSE board examination centre.

### Feature Overview

```
Exam Centre Lifecycle
├── 1. Centre Setup
│   ├── Centre Details (name, number, address)
│   ├── Exam Functionaries (teachers who will invigilate)
│   ├── Subjects (rolled from platform catalog)
│   ├── Rooms/Halls (capacity, floor, room number)
│   └── Undertaking forms + Centre Guidelines
│
├── 2. Pre-Exam Preparation
│   ├── CBSE Datesheet import (PDF parse → structured entries)
│   ├── Candidate import (PDF "List of Candidates" from CBSE OASIS portal)
│   ├── Answer sheet inventory entry (serial number ranges per class/type)
│   ├── Form 66 import (attendance list from CBSE)
│   └── Seating plan generation (algorithmic, with CBSE compliance rules)
│
├── 3. Exam Day Operations
│   ├── Duty assignment (which teacher invigilates which room)
│   ├── Attendance marking (Form 66 + present/absent toggle)
│   ├── Real-time exam dashboard (today's exams, room occupancy)
│   └── Answer sheet dispatch (serial allocation, dispatch slip PDF)
│
└── 4. Post-Exam Documentation
    ├── Remuneration calculation (duty days × rate)
    ├── Export: PDFs (seating plan, duty record, dispatch slip, room folder slip, CBSE copy)
    └── CBSE Circulars archive
```

### Candidate Import Pipeline

CBSE sends schools a PDF called "Centre List of Candidates." The import flow:

1. Upload PDF via `/candidates/import`
2. `candidatePdfParser.js` extracts text using `pdf-parse`, then regex-parses roll numbers, names, subjects, category, PwD status
3. `candidateReimportController.js` handles re-imports with a **diff view** — shows added/removed/changed candidates with a side-by-side modal before committing
4. Cloudinary stores the original PDF for audit
5. Candidates are linked to Subject documents via both ObjectId refs and a `subjectCodes[]` array (for fast lookups without population)

### Form 66 Import

Form 66 is the official CBSE attendance sheet. The import:
1. Accepts either: (a) CBSE `.txt` file (machine-readable), or (b) scanned PDF
2. For TXT: `form66Parser.js` extracts rollNo, subject, exam date, present/absent
3. For PDF: `form66PDFTemplate.js` + `attendanceSheetParser.js` use regex on extracted text
4. Records stored in `Form66` collection and take **priority over Candidate model** in the seating plan builder (Form 66 is ground truth for who actually showed up)

### Seating Plan Generator — Deep Dive

This is the most algorithmically complex part of the system. The `SeatingPlanBuilder` class (`server/src/utils/seatingPlanBuilder.js`) implements CBSE examination seating rules:

**Physical layout:**  
Each room seats 24 candidates in a 3-column × 8-row grid. Columns map to Question Paper codes (1, 2, 3 — cycling per seat).

**Room Allocation Modes:**
- **Auto mode**: Rooms rotate algorithmically based on class changes between exam days
- **Manual mode**: Superintendent manually assigns rooms per date via `allocationOrderByDate` map on Room model

**Key algorithms:**

*Class-based day rotation (Auto mode):*  
- If 10th and 12th exams are on separate days, rotation tracks independently per class
- If the class changes day-over-day (e.g., 10th on Day 1, 12th on Day 2), start from Room 1
- If the same class continues (e.g., 10th Day 1, 10th Day 2), shift by 1 room

*Same-day continuity:*  
When both 10th and 12th exams happen on the same day, candidates are allocated continuously (not per-class). The exam with more candidates gets first pick of rooms; subsequent exams start where the previous ended — either sharing the last room's remaining seats or moving to the next room.

*Shared room logic:*  
If two exams have combined candidates ≤ 24, they share one room. The "guest" exam fills col3 → col2 → col1-tail so there are no empty rows in the printed PDF.

**CBSE Rule 1 — No candidate shall sit in the same room across all exams:**  
After each seating plan is generated, `SeatingPlanAllocation` records are upserted (rollNo, examDate, roomNo). Before generating the next exam's plan, the builder queries prior allocations for all current candidates and tries every possible start room index to minimise conflicts. If zero-conflict is impossible, it throws an error prompting the admin to add more rooms.

**Answer sheet serial allocation:**  
The builder simultaneously computes which answer sheet serial number each candidate gets, based on: (a) their global position across all candidates for that class/answer-sheet-type ordered by exam date, (b) the serial range from `AnswerSheet` model, (c) skipping discarded/damaged serials.

**Output PDFs (via Puppeteer):**
- `cbse-copy.html` — Official CBSE seating plan (one page per room)
- `room-folder-slip.html` — Folder slip pasted inside each room's answer sheet packet
- `room-door-slip.html` — Door slip displayed outside room
- `main-gate.html` — Main gate display

### Duty Assignment

The `dutiesController.js` manages teacher-to-room assignment for each exam day:
- **Auto-assign**: distributes teachers across rooms, respecting supervision history (teachers shouldn't supervise the same room repeatedly)
- **Manual assign**: superintendent picks teacher per room per date
- After each seating plan generation, `rebuildSupervisionHistoryForDate` fires (via event bus) to keep duty recommendations current
- Export: `functionary-duty-record.html` → PDF per teacher showing all their assigned duties

### Remuneration

The `remunerationController.js` computes pay for each teacher based on:
- Number of exam days they were on duty
- Platform-managed `MasterRemunerationRate` (admin sets rate per day in the platform portal)
- Export includes per-teacher breakdown as printable PDF

---

## 6. Internal Exams Module (EXMCL)

EXMCL reuses CNTR's frontend pages (candidates, seating, duties) under `/exmcl/*` routes, adding:

**New models:**
- `ExamDefinition`: named exam (e.g., "Unit Test 1", "Half Yearly"), with code, max marks, display order — scoped per academic session
- `ExamResult`: `{ examId, studentId, class, section, marks: Map<subjectName, number> }` — unique per (exam, student, session)

**New flows:**
- Define internal exams via `ExamDefinitionController`
- Enter/edit marks per student per subject via `ExamResultController`
- Generate report cards: `reportCardController.js` aggregates results across exam definitions and renders `report-card.html` via Puppeteer

**Frontend pages** (`/exmcl/*`):
`ExmclExams`, `ExmclResult`, `ExmclReportCard`, `ExmclAwardList`, `ExmclSubjects`, `ExmclDatesheets`, `ExmclSyllabus`, `ExmclMarksDistribution`, `ExmclCirculars`, `ExmclQuestionPapers`

Several pages are currently placeholders (award list, question papers, syllabus, marks distribution).

---

## 7. Timetable Module Deep Dive (TMTBL)

### State Model

The entire timetable configuration is a **single MongoDB document** (`TimetableState`, one per academic session) containing:
- `classes[]` — class + section + floor + assigned teacher (incharge) + subject list
- `subjects[]` — name, type, `requiresConsecutivePeriods` flag, `consecutivePeriodCount` (2–4), color
- `teachers[]` — name, shortName, subjects they can teach
- `teacherSubjectAllocations[]` — which teacher teaches which subjects in which class
- `parallelSubjectPairs[]` — subject pairs that must occur in the same period slot (e.g., Hindi/English offered simultaneously for different students)
- `commonPeriods[]` — same subject/teacher across multiple sections simultaneously
- `periodAllocation` — per-class, per-subject weekly period count
- `timetableGrid` — filled 3-level object: `{ classId → day → periodIndex → { subject, teacher } }`
- `bellTimings` — school day structure: start time + rows (period or break) with durations

### Generator Algorithm

`timetableGeneratorService.js` implements a **randomised greedy algorithm with multi-pass conflict resolution**, run up to 8 times to find the best fill:

**Phase 0a: Class incharge anchoring**
- The class incharge teacher's subject is anchored to Period 0 every day they have demand. This ensures morning assembly / main teacher starts first period.

**Phase 0b: Column affinity**
- Each subject tries to claim one period column (same period slot across all days). This produces a natural "Math is always Period 2" structure. Subjects with >6 periods/week may use a second column.

**Phase 1: Parallel pairs**
- Parallel subject pairs (SubjectA/SubjectB) are assigned to the same (day, period) slot simultaneously for the class. Grid cell shows `"SubjectA/SubjectB"`.

**Phase 2: Common periods**
- Same teacher, multiple sections, same (day, period). All sections get the assignment simultaneously.

**Phase 3: Main greedy fill**
- Shuffled (day, period) slots × shuffled classes, picking subjects with highest remaining demand first.

**Phase 4: Straggler pass**
- Relaxes the "max 2 same-subject per day" soft constraint to fill remaining empty slots.

**Hard constraints (never violated):**
- Teacher double-booking (same teacher, same period, different classes)
- Consecutive lab periods require N consecutive free slots for teacher
- Max 3 consecutive periods per teacher before a free period

**Soft constraints (best-effort):**
- Max 2 same-subject per day per class
- Max 2 sports/PE classes in the same slot
- Class incharge starts each morning

**Output:**
- Conflict report listing any under-allocated subjects with remaining demand
- Stats: total slots, filled slots, conflict count, duration ms

### Version Management

`TimetableVersion` stores snapshots of published timetables. `BellTimingVersion` stores bell schedule snapshots. Each version is immutable once published — the live grid lives in `TimetableState`.

### Export

`timetableExportService.js` renders:
- `timetable-class.html` → per-class view PDF
- `timetable-teacher.html` → per-teacher view PDF

---

## 8. Inter-module Dependencies

```
┌─────────────────────────────────────────────────────────┐
│                    PLATFORM DB                          │
│  (Tenant registry, Master data, Rollouts, Billing)      │
└────────────────────┬────────────────────────────────────┘
                     │ reads tenant record on every request
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  CORE MODULE                            │
│  User, Teacher, Subject, Room, AcademicSession          │
│  Routes: /auth, /teachers, /subjects, /rooms, /sessions │
│  Always loaded — zero module dependencies               │
└────┬────────────────────────────┬────────────────────────┘
     │ event bus                  │ shared models
     ▼                            ▼
┌───────────────┐    ┌──────────────────────────────────┐
│  TIMETABLE    │    │            CNTR                  │
│  TimetableState│   │  Candidate, Form66, Seating,     │
│  Uses: Teacher,│   │  DutyAssignment, AnswerSheet...  │
│  Subject from  │   │  Uses: Teacher, Subject, Room    │
│  its local     │   │  from local snapshot             │
│  snapshot      │   └──────────┬───────────────────────┘
└───────────────┘               │ extends (shared models + adds:)
                                ▼
                    ┌───────────────────────┐
                    │        EXMCL          │
                    │  ExamDefinition       │
                    │  ExamResult           │
                    │  Uses: Student        │
                    └───────────────────────┘
                    
┌───────────────┐
│    ATTND      │
│  StaffAttnDaily│
│  StdntAttnDaily│
│  Uses: Teacher,│
│  Student,      │
│  TimetableState│
└───────────────┘
```

**What is truly independent:**
- TIMETABLE has no dependency on CNTR — a school can use timetable without ever running a board exam
- CNTR has no dependency on TIMETABLE — exam centre operations never query timetable data
- ATTND reads `TimetableState` to suggest period-wise attendance (requires TIMETABLE data if used together, but can function standalone)

**What shares data:**
- `Teacher` is a core entity used by CNTR (for duty assignment), TIMETABLE (for allocation), and ATTND (for staff attendance) — but each module takes a **local snapshot** at its own model level rather than a live join
- `Subject` similarly: platform rolls out subjects → core `Subject` collection → each module reads its own copy

---

## 9. Frontend Structure

### Routing Strategy

Uses **`HashRouter`** (not `BrowserRouter`) — this is intentional for Vercel deployment compatibility without needing server-side catch-all rules. Route path: `/#/dashboard`, `/#/seatingplan`, etc.

### Route Hierarchy

```
Public Routes (no auth required)
├── /          → PublicLanding (variant: CntrLanding | TmtblLanding | StdntLanding)
├── /pricing   → Pricing
├── /login     → Login
├── /signup    → Signup (OTP-verified onboarding)
└── /forgot-password

Auth-gated (authenticated but pre-session)
└── /select-session → SessionSelector

Protected Routes (ProtectedRoute wrapper)
└── Layout (Header + Sidebar)
    ├── /dashboard
    ├── /time-table/*     (TimetableProvider context wraps all timetable routes)
    ├── /stdnt/*          (Student module)
    ├── /staaf/*          (Staff module — placeholder)
    ├── /attnd/*          (Attendance)
    ├── /centre-details, /exam-functionaries, /duties, /undertaking
    ├── /candidate-details, /subjects, /datesheets, /examrooms
    ├── /answersheets, /seatingplan, /form66, /attendance
    ├── /dispatch-slip, /remuneration
    ├── /exmcl/*          (Internal exams)
    ├── /cbse-circulars, /cbse-portals, /centre-guidelines
    ├── /billing, /account-settings, /help-support
    └── Legacy redirects  (/candidates → /candidate-details, /rooms → /examrooms, etc.)
```

### State Management Architecture

Two complementary systems are used:

**Redux Toolkit** (global, persisted):
- `authSlice` — JWT tokens, current user, feature toggles, loading state
- `teacherSlice`, `studentSlice`, `subjectSlice`, `roomSlice`, `datesheetSlice`, `dispatchSlice` — cached entity lists (used for quick local operations before server sync)

**TanStack React Query v5** (server state, per-page):
- Every feature has a custom hook (`useCandidates`, `useSeatingPlan`, `useDuties`, etc.) that wraps React Query calls
- Handles loading/error states, caching, invalidation after mutations
- Services layer (`/services/*.ts`) contains all Axios calls

### Context

- `AcademicSessionContext` — tracks the active academic session and provides `x-academic-session` header to all API calls
- `TimetableContext` — provides timetable state to all timetable sub-pages (wraps only when timetable feature is enabled per `user.featureToggles`)

### Multi-brand Public Landing

`getPublicBrandVariant()` reads the hostname to determine which public landing page to show:
- `cntr.*` → `CntrLanding` (exam centre product)
- `tmtbl.*` → `TmtblLanding` (timetable product)
- `stdnt.*` → `StdntLanding` (student management product)

This allows the same codebase to serve multiple product landing pages based on subdomain.

### Notable UI Components

**Dialog system** (`/components/common/Dialog/`):
A fully custom dialog stack with `useDialogStack`, animations, and a compound-component API (Dialog → DialogHeader → DialogBody → DialogFooter). Supports multiple stacked dialogs.

**Dropdown** (`/components/common/Dropdown/`):
Custom virtualized dropdown using `@tanstack/react-virtual` for large option lists.

**Tabs** (`/components/common/Tabs/`):
Custom tab system with full documentation + migration guide included.

### Sidebar Dynamic Counts

`useSidebarCounts.ts` fetches aggregated counts (candidates, answer sheets, duties, etc.) to display badges in the sidebar navigation — a small dashboard indicator per section.

### Billing Banner

`BillingBanner.tsx` in the layout checks `billingEntitlement.accessMode` and shows a banner when the account is in `read_only` or `core_only` mode.

---

## 10. Admin Portal

The admin portal (`/admin`) is a **minimal React SPA** with custom `history.pushState`-based routing (no React Router). It connects to the same Express backend's `/api/admin/*` routes using a separate JWT.

**Pages:**
| Path | Purpose |
|---|---|
| `/` | Tenants list — create, suspend, view per-tenant details |
| `/master-subjects` | CBSE subject catalog management |
| `/master-datesheet` | Official CBSE datesheet upload + rollout trigger |
| `/master-guidelines` | Centre guidelines PDF management |
| `/master-undertaking` | Undertaking form management |
| `/remuneration` | Platform remuneration rates |
| `/packing-dispatch` | Packing & dispatch instructions |
| `/features` | Per-tenant feature toggle management |
| `/rollouts` | View rollout history, retry failed rollouts |
| `/billing/tenants` | Billing status per tenant |
| `/billing/catalog` | Billing plan catalog management |
| `/school-directory` | School directory management |

The admin portal deliberately avoids external routing libraries — it uses a simple `window.history.pushState + popstate` pattern, keeping the bundle minimal.

---

## 11. Deployment Architecture

### Local Development

```
npm run dev:all
├── server  → nodemon src/server.js     (port 5000)
├── client  → vite dev                 (port 5173, proxies /api → port 5000)
├── admin   → vite dev                 (port 5174)
└── billing → Postgres (Neon), billing module only
```

Vite's dev proxy (`vite.config.ts`) forwards `/api` to `localhost:5000`.

### Production (Vercel)

| App | Domain | Platform | Notes |
|---|---|---|---|
| Main client | `school.capabble.cloud` | Vercel | `client/vercel.json` + Vercel project |
| Admin portal | _(separate)_ | Vercel | `admin/vercel.json` |
| Company landing | `capabble.cloud` | Vercel | `capabble-landing/` Next.js 15 |
| Backend API | `api.capabble.cloud` | _(Render/Railway/VPS)_ | `server/ecosystem.config.js` (PM2) + `render.yaml` |

### Tenant Resolution

Each request identifies its tenant via (in priority order):
1. `x-tenant-slug` request header (client explicitly sends this)
2. Subdomain: `{slug}.school.capabble.cloud` → slug = `{slug}`
3. Query param: `?tenant={slug}` (fallback for dev)

The client stores and sends `x-tenant-slug` on every authenticated request (computed from the user's tenant slug stored in the JWT payload / Redux auth state).

### PM2 / Ecosystem Config

`server/ecosystem.config.js` configures PM2 for production:
- Cluster mode
- Auto-restart on crash
- Environment variable injection
- Log rotation

### Billing Micro-service

Billing lives in `server/src/modules/billing` and keeps its data in its own Postgres database (Neon). The server reads each school's entitlement from it in-process and caches it for 45 seconds; see the module's README.

The main server's `billingEntitlementMiddleware` implements three access modes:
- `full` — unrestricted
- `read_only` — blocks all POST/PUT/PATCH/DELETE + specific read endpoints (seating plan generation, PDF exports, Form 66 PDF)
- `core_only` — only allows dashboard, candidates, subjects, datesheets, billing, auth

---

## 12. What Makes This Project Non-Obvious

### 1. AsyncLocalStorage as a transparent multi-tenancy bus

The entire tenant context — which database connection to use, which models are registered, which academic session to filter on — is propagated via Node.js `AsyncLocalStorage` rather than thread-locals or passed-down parameters. This means:
- Mongoose model proxies resolve the correct tenant DB without any controller needing to know about tenancy
- The academic session plugin auto-scopes every query without touching controller code
- Third-party code (like PDF generators calling model methods) automatically gets the right tenant scope

### 2. The Seating Plan Builder as a Domain Expert

The `SeatingPlanBuilder` class encodes several genuine CBSE examination rules as code:
- **Rule 1** (no same room twice for a candidate) is enforced via historical persistence + exhaustive search over all possible start indices
- **Shared room filling** fills reverse-column order (col3 → col2 → col1-tail) specifically so the printed PDF has no empty rows between two classes sharing a room
- The class-based day rotation ensures room sequences feel consistent to administrators across a 2–3 week exam period
- Answer sheet serial assignment is co-generated with seating — each candidate gets a specific serial number printed on their seat slip

### 3. The Timetable Generator is a Purpose-Built Constraint Solver

The 4-phase greedy algorithm in `timetableGeneratorService.js` runs up to 8 randomised attempts, keeping the best result. Each attempt shuffles class and slot order to escape local optima. The phases themselves encode school-specific domain knowledge:
- Phase 0a: class incharge anchoring (morning first period)
- Phase 0b: column affinity (same subject in same period slot all week)
- Phase 1: parallel pairs (biology/geography at same time because one teacher handles one while another handles the other)
- Phase 2: common periods (same teacher, different sections, same slot)
- Sports concurrency cap (max 2 classes doing PE simultaneously because the field capacity is limited)

### 4. Feature Toggle → Model Registration linkage

When a tenant activates the TIMETABLE module, `getActiveModelKeys()` adds `TimetableState`, `TimetableVersion`, `BellTimingVersion` to the connection registration list. The `createContextModelProxy` ensures that if code somehow tries to access `TimetableState` for a CNTR-only tenant, it logs a warning rather than silently operating on the wrong connection.

### 5. Platform Rollout System

The admin portal has a one-click "rollout" that pushes master data (official CBSE datesheet, subject catalog, guidelines) to **every active tenant database in sequence**. This replaces the manual process of every school downloading and re-uploading CBSE documents. The rollout:
- Creates a `DataRollout` record with per-tenant status
- Executes asynchronously (response returns immediately; admin polls for completion)
- Supports retry for failed tenants
- Is idempotent for subjects (upsert by code+class)

### 6. Candidate Re-import Comparison

When CBSE updates the candidate list mid-cycle, `candidateReimportController.js` compares the new import against the existing database and produces a structured diff (added, removed, name-changed, subject-changed). The frontend shows this as a side-by-side comparison modal before any data is committed.

### 7. Public Signup via OTP Ticket

Self-service school onboarding (`onboardingTicketService.js`) uses a **SHA-256 hashed ticket** approach:
- School fills signup form → server generates a random 32-byte token, stores only its hash
- Token is sent in an email link
- OTP verification is required before tenant provisioning
- Ticket TTL, OTP TTL, and max attempts are all environment-configurable
- OTP hash is stored (not plaintext) — even if the DB is leaked, OTPs can't be replayed

### 8. The Admin Portal Has Zero Routing Dependencies

The admin portal intentionally uses only `window.history.pushState` + `popstate` event listener for navigation — no React Router, no Next.js. This keeps the admin bundle tiny and removes an entire class of routing edge-case bugs in an internal tool.

### 9. Form 66 has two intake formats

Form 66 comes from CBSE in two formats depending on the year/region: a structured `.txt` file (easy machine parsing) and a scanned PDF (requires regex on extracted text). The system handles both transparently — users don't need to know which format they're uploading. The `.txt` path is exact; the PDF path uses `pdf-parse` + carefully tuned regex patterns derived from actual CBSE PDFs.

### 10. Billing is Fail-Open for Reads, Fail-Closed for Writes

When the billing micro-service is unreachable, the `billingEntitlementMiddleware` allows all GET requests through (fail-open) but blocks POST/PUT/PATCH/DELETE (fail-closed). This means a billing service outage doesn't cause a school to lose access to their data during an active exam day, but prevents data writes that would go un-billed.

---

*This document was generated by analyzing the full source tree of the CAPABBLE ERP monorepo as of June 2026.*
