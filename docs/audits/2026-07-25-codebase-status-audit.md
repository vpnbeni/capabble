# CAPABBLE ERP — Codebase Status Audit

**Date:** 2026-07-25
**Scope:** Full monorepo (`server`, `client`, `admin`, `billing-service`, `capabble-landing`)
**Method:** Static code audit (routes → controllers → models → client wiring), git history analysis, dependency check. No live environment was run; classifications are based on code presence/absence, not runtime testing.

---

## 1. Project Inventory

### Tech stack (versions as pinned in package.json; "latest" = current npm registry version at audit time)

| Layer | Technology | Pinned | Latest available |
|---|---|---|---|
| Frontend | React | ^18.2.0 | 19.2.8 |
| Frontend | React Router | ^6.20.1 (HashRouter) | 7.18.1 |
| Frontend | Vite | 5.x | — |
| Frontend | TypeScript, Tailwind CSS 3, Redux Toolkit 1.9, TanStack Query v5 | — | — |
| Backend | Node.js | engines: >=16.0.0 | Node 25.2.1 installed locally |
| Backend | Express | ^4.18.2 | 5.2.1 |
| Backend | Mongoose | ^8.0.3 | 9.8.0 |
| Backend | Puppeteer (PDF) | ^24.29.0 | 25.3.0 |
| Backend | Tesseract.js (OCR) | ^6.0.1 | 7.0.0 |
| Backend | BullMQ + ioredis (queue) | ^5.71.0 | 5.81.2 |
| Auth | JWT (jsonwebtoken), bcryptjs | — | — |
| Security middleware | Helmet, express-rate-limit, express-mongo-sanitize, xss-clean, hpp | — | see §4 for staleness |
| DB | MongoDB (Atlas, `mongodb+srv://...`), database-per-tenant | — | — |
| Testing | Jest + Supertest (server only) | — | — |
| Billing | Standalone Express+Mongoose micro-service ("capabble-ledger-service") | — | — |
| Landing | Next.js (capabble-landing, separate marketing site, lives inside this repo despite CLAUDE.md describing it as a separate repo) | — | — |

### Lines of code (cloc, `.next` build output and node_modules excluded)

| App | Files | Code lines |
|---|---|---|
| server | 356 | 56,531 |
| client | 241 | 68,833 |
| admin | 29 | 7,756 |
| billing-service | 33 | 3,420 |
| **Core product subtotal** | **659** | **136,540** |
| capabble-landing (marketing site) | 40 | 9,409 |
| **Repo total (incl. marketing site)** | **699** | **145,949** |

Language split (core product): TypeScript ~63.9k lines (client+admin), JavaScript ~46.5k lines (server+billing).

### Git history

- First commit: **2025-06-14**. Most recent commit: **2026-04-30** (`db96e63`, "Add report card generation and sidebar memo").
- Total commits (branch `stage` + merges from `main`): **197**.
- Contributors: **2** (`Vipin`, `annujbeniwal`).
- Commit frequency by month:

  | Month | Commits |
  |---|---|
  | 2025-06 | 3 |
  | 2025-07 | 1 |
  | 2025-10 | 1 |
  | 2025-11 | 7 |
  | 2026-01 | 11 |
  | 2026-02 | 76 |
  | 2026-03 | 85 |
  | 2026-04 | 13 |
  | 2026-05 to 2026-07 (today) | **0** |

- **The project has been dormant for 86 days** (last commit 2026-04-30 → audit date 2026-07-25) after a sharp two-month burst of activity (Feb–Mar 2026, 161 of 197 commits = 82% of all history). This reads as a single developer's concentrated sprint that stopped abruptly, not steady ongoing development.

### Directory / module structure (actual, not aspirational)

| Path | Purpose |
|---|---|
| `server/` | Express API — all business logic; NOT organized into the `modules/core, modules/exam, modules/timetable` structure CLAUDE.md describes as a target — see §3 |
| `server/src/modules/` | Partial module registrars that exist today: `core`, `cntr`, `timetable`, `attnd` (4 of them; STDNT/STAAF/EXMCL have no module directory of their own) |
| `client/` | React SPA, HashRouter, ~60 page components |
| `admin/` | Separate React SPA — platform-ops portal (tenant management, billing admin) |
| `billing-service/` | Standalone Express micro-service, real HTTP integration with `server` (not orphaned) |
| `capabble-landing/` | Next.js marketing site — actually tracked inside this repo, contradicting CLAUDE.md's claim it's a separate repo/deploy |
| `docs/` | ~85 markdown files, almost entirely fix-log style ("X_FIX.md", "X_IMPLEMENTATION.md") rather than durable reference docs |
| `test-doc/` | Real sample CBSE documents (Form 66, attendance sheets) used as parser fixtures — not an automated test suite |
| `test-pages/` | Static HTML files for manual API testing (link-candidate-subjects.html, test-answer-sheets-api.html, etc.) — manual dev tools, not automated tests |
| `deploy/nginx/` | One nginx conf file for the API |

---

## 2. Feature Inventory

Classification legend: **WORKING** / **PARTIAL** / **STUBBED** / **PLANNED ONLY**. All citations are `file:line`.

### 2.1 CNTR — Exam Centre Management

| Feature | Status | Evidence |
|---|---|---|
| CBSE datesheet PDF/OCR import (multi-stage: structured parse → OCR fallback → regex fallback) | WORKING | `server/src/controllers/datesheetController.js:159-516`, `server/src/utils/cbseDatesheetParser.js:112-158` |
| Master → tenant datesheet rollout | WORKING | `server/src/services/cbseDatesheetRolloutService.js:20-55` |
| Centre-specific datesheet generation (candidate-choice filtered) | WORKING | `server/src/controllers/datesheetController.js:731-948` |
| Legacy `DateSheet` CRUD/publish (parallel path to CBSE import) | PARTIAL | `datesheetController.js:521-728` — two coexisting datesheet concepts (`DateSheet` vs `CBSEDatesheet`), no evidence one drives the other |
| Candidate PDF import (bulk, dedup, auto-subject creation) | WORKING | `server/src/controllers/candidateController.js:449-715`, parser `server/src/utils/candidatePdfParser.js:190-370` (heuristic/positional parsing, will break on PDF layout drift) |
| Candidate re-import diff/apply (compare → impact preview → apply) | WORKING | `server/src/controllers/candidateReimportController.js:14-357` |
| Candidate CRUD + stats | WORKING | `candidateController.js:69-93,322-829` |
| Room management (via seating-plan controller) | WORKING | `server/src/controllers/seatingPlanController.js:484-573` |
| Room management (legacy `/api/rooms`, actively mounted) | **STUBBED** | `server/src/routes/roomRoutes.js:9-28` — every verb returns `res.json({ message: 'Room routes - Coming soon' })`, live behind `requireTenantFeature('examrooms')` |
| Seating plan generation + PDF (CBSE room-repeat rule, shared-room merge, class rotation) | WORKING | `server/src/utils/seatingPlanBuilder.js:70-323,1004-1223` |
| Seating plan template/layout settings | WORKING | `seatingPlanController.js:5-482` |
| Duty assignment (auto backtracking solver + CBSE Rule 2) | WORKING (tested) | `server/src/controllers/dutiesController.js:520-908,194-339`; covered by `dutiesController.assignDailyDuties.test.js` |
| Duty selections (functionary pools) | WORKING | `server/src/controllers/dutySelectionController.js:12-137` |
| Functionary duty record PDF export | WORKING | `dutiesController.js:910-1008` |
| Supervision-history rebuild | WORKING | `dutiesController.js:1010-1175` |
| **Remuneration calculation/billing** | **STUBBED** | `server/src/controllers/remunerationController.js:1-32` — only exposes a flat rate table; no code anywhere computes amount owed per invigilator against actual duty records, no aggregation, no export |
| Form 66 attendance import (TXT → parse → PDF, 8-stage pipeline) | WORKING | `server/src/controllers/form66Controller.js:138-299` |
| Form 66 → candidate fallback in seating plan | WORKING | `seatingPlanBuilder.js:540-589` |
| Answer sheet inventory (types, serials, discard/use) | WORKING | `server/src/controllers/answerSheetController.js:861-1241` (2,404-line controller) |
| Answer sheet ↔ seating plan serial allocation | WORKING | `seatingPlanBuilder.js:344-538` |
| Answer sheet dispatch slip PDF | WORKING | `server/src/controllers/dispatchSlipController.js:42-130` (note: `insuredAmount` hardcoded fallback `'1000'`, not CBSE-mandated) |
| **Answer sheet dispatch status lifecycle tracking** | **PARTIAL (dead enum)** | `server/src/utils/constants.js:46-52` defines `DISPATCH_STATUS` (pending/in_progress/dispatched/delivered/returned) but it is **never referenced** by any controller — download/record generation exists, status transitions do not |
| CBSE circulars (manual entry, no auto-import) | WORKING | `server/src/controllers/cbseCircularController.js:1-91` |
| Centre guidelines (PDF upload/parse/search) | WORKING | `server/src/controllers/guidelinesController.js:1-377` |
| Centre details (superintendent/packing/dispatch config) | WORKING | `server/src/controllers/centreDetailsController.js:15-75` |
| Undertaking forms (platform upload → tenant view/download) | WORKING | `server/src/controllers/undertakingController.js:8-55` |
| **School profile** | **PARTIAL — security gap** | `server/src/routes/schoolProfileRoutes.js:1-11` never applies `protect` (JWT auth) middleware, unlike every sibling route file — any request reaching the right tenant host can read/write school profile and upload a logo with no valid token |
| PDF/Excel export (teacher/student data, generic) | WORKING | `server/src/controllers/exportController.js:1-336` |
| **Exam calendar API** | **PLANNED ONLY / dead code** | `server/src/routes/calendar.js` fully implemented but **never mounted**; `server/src/app.js:223` explicitly comments it out ("Temporarily disabled for debugging"); client `calendarService.ts` still calls it and 404s in production (`DateSheets.tsx`) |

**CNTR tally: 23 WORKING, 4 PARTIAL, 2 STUBBED, 1 PLANNED ONLY (30 features)**

### 2.2 STDNT — Student Management

| Feature | Status | Evidence |
|---|---|---|
| Student CRUD | WORKING | `server/src/controllers/studentController.js:286-611` |
| Student deletion | PARTIAL | `studentController.js:571-611` — hard delete only, no soft-delete, no cascade cleanup of linked `Candidate`/`Form66` records, no event emitted |
| Student bulk import (JSON) | WORKING | `studentController.js:797-891` |
| Student import (Excel/CSV template) | WORKING | `studentController.js:941+` |
| Subject assignment to students | WORKING | `studentController.js:693-744` |
| Student stats/dashboard aggregation | WORKING | `server/src/models/Student.js:307-404` |
| **STDNT as an independent module (per CLAUDE.md)** | **STUBBED — contradicts docs** | No `modules/stdnt/` directory exists; `Student` model lives under the `cntr` module bucket, gated by CNTR's `candidates` feature flag (`server/src/modules/cntr/routes.js:14,33`, `server/src/constants/moduleModelKeys.js:34-35`) |

**STDNT tally: 5 WORKING, 1 PARTIAL, 1 STUBBED, 0 PLANNED (7 features)**

### 2.3 STAAF — Staff Management (CLAUDE.md lists this as "Planned")

| Feature | Status | Evidence |
|---|---|---|
| Staff CRUD (create/edit, via shared Teacher model) | WORKING | `client/src/pages/StaafStaffMembers.tsx:1-27` wraps `Teachers.tsx`; `server/src/controllers/teacherController.js:184-547` |
| **Staff delete** | **STUBBED** | `client/src/pages/Teachers.tsx:612-614` — every route rendering the Teachers grid sets `uiOnlyDelete=true`; the real `DELETE /api/teachers/:id` (with soft/hard delete + event emission) exists server-side but is **never called by any wired UI** — deletion only hides rows in local React state |
| Staff directory (read-only) | WORKING | `client/src/pages/Staff.tsx:24-106` |
| **STAAF as standalone module** | **STUBBED, matches "Planned" doc status** | No `modules/staaf/` directory; feature-flag entry exists (`tenantFeatureCatalog.json:37-45`) but zero dedicated backend — pure relabel of the Teacher/CNTR model |

**STAAF tally: 2 WORKING, 0 PARTIAL, 2 STUBBED, 0 PLANNED (4 features)**

### 2.4 ATTND — Attendance (CLAUDE.md lists this as "Planned")

| Feature | Status | Evidence |
|---|---|---|
| Staff daily attendance marking | WORKING | `server/src/controllers/attndController.js:139-189`, `server/src/models/AttndDailyRecord.js:5-32` |
| Student daily attendance marking | WORKING | `attndController.js:191-254` |
| Staff/student directory + filters | WORKING | `attndController.js:22-137` |
| **Attendance reports/export** | **PLANNED ONLY** | No report/download/export route exists anywhere in `attndRoutes.js` — only raw CRUD |
| Exam-day absentee report (separate CNTR feature, similarly named) | WORKING | `server/src/controllers/attendanceController.js` (650 lines), `attendanceRoutes.js:13` — do not conflate with ATTND module |
| ATTND as a clean bounded module | PARTIAL | Module directory exists (`modules/attnd/`) but directly depends on/re-registers `Teacher`/`Student`/`TimetableState` owned by other modules rather than consuming snapshots — real cross-module coupling, not the clean boundary CLAUDE.md describes |

**ATTND tally: 3 WORKING, 1 PARTIAL, 0 STUBBED, 1 PLANNED (5 features)**

### 2.5 TMTBL — Timetable

| Feature | Status | Evidence |
|---|---|---|
| Teacher-subject-class allocation | WORKING | `server/src/models/TimetableState.js:142-185` |
| Timetable generation algorithm (greedy, clash-avoidance, consecutive periods, sports concurrency cap) | WORKING | `server/src/services/timetableGeneratorService.js:1-822` |
| Bell timings + versioning | WORKING | `server/src/controllers/timetableController.js:847-951` |
| Parallel subjects | WORKING | `timetableGeneratorService.js:149-161,508-556` |
| Conflict resolution/report | WORKING | `timetableGeneratorService.js:669-707` |
| Version management (draft/publish/archive, single-published enforced) | WORKING | `timetableController.js:1039-1105` |
| Exports (Excel/Class PDF/Teacher PDF) | WORKING | `server/src/services/timetableExportService.js` |
| **Substitution scheduling** | **STUBBED** | `client/src/pages/timetable/Substitution.tsx:56-85` — local `useState` checkbox grid only, no service call, no backend model/route at all |
| **Versions page** | **PLANNED ONLY / dead route** | `client/src/pages/timetable/Versions.tsx:1-6` — body is only a `<Navigate>` redirect |
| Local teacher snapshot (per CLAUDE.md claim) | WORKING (confirmed true) | `TimetableState.js:85-108` stores denormalized copies, not refs |
| **Teacher shortName sync** | **PARTIAL — silent bug** | `teacherController.js:499-504` emits `teacherShortName` from a field that **doesn't exist** on the `Teacher` model — every sync overwrites the denormalized value with `undefined` |

**TMTBL tally: 8 WORKING, 1 PARTIAL, 1 STUBBED, 1 PLANNED (11 features)**

### 2.6 EXMCL — Internal/Class Exams (CLAUDE.md: "Next up")

| Feature | Status | Evidence |
|---|---|---|
| Exam definition/creation (UT1/PT1/SA1 templates) | WORKING | `server/src/controllers/examDefinitionController.js:8-183` |
| Marks entry (bulk grid save/load) | PARTIAL | `server/src/controllers/examResultController.js:4-77` — no server-side bound-check against `exam.maximumMarks`; "delete subject column" is UI-only, doesn't persist |
| **Marks distribution rules (theory/practical/enrichment weightage)** | **PLANNED ONLY** | `client/src/pages/ExmclMarksDistribution.tsx:1-19` — static placeholder paragraph, no state, no API, no backend route/model anywhere |
| Result calculation (total/percentage) | PARTIAL | `server/src/controllers/reportCardController.js:52-88` — applies one flat max-marks value to every subject regardless of actual per-subject max; no exposed results-summary/rank API |
| Grading/CCE scheme | PARTIAL (hardcoded, incomplete) | `reportCardController.js:11-29` — real CBSE 9-band cutoffs but collapses E1/E2 into one flat "E"; no co-scholastic (A–D) scale anywhere |
| Report card PDF generation | WORKING (with gaps) | `reportCardController.js:105-202` — real Puppeteer/Handlebars rendering; **bulk "download N selected" ignores the selection and always generates the whole class** (`client/src/pages/ExmclReportCard.tsx:163-173,229-248` vs `reportCardController.js:149-202` — no student-id filter param exists server-side) |
| Report card template/format | PARTIAL | `server/src/templates/report-card.html:308-356` — no Co-Scholastic Area section (mandatory CBSE field); Attendance/Remarks footer fields are hardcoded blank, not data-bound |
| **Question papers** | **PLANNED ONLY** | `client/src/pages/ExmclQuestionPapers.tsx:1-19` — static placeholder, no route/model |
| **Syllabus tracking** | **PLANNED ONLY** | `client/src/pages/ExmclSyllabus.tsx:1-19` — static placeholder |
| Circulars (auto-incrementing reference numbers, draft/publish) | WORKING | `server/src/controllers/examCircularController.js:1-203` |
| **Award list** | **PLANNED ONLY** | `client/src/pages/ExmclAwardList.tsx:1-19` — static placeholder; described purpose (post-checking marks-entry sheet) isn't even the same thing as the existing exam-results API |
| Datesheets (reuses CNTR Datesheet model with `examType:'internal'`) | WORKING | `server/src/models/Datesheet.js:13-18` |
| Subjects (thin wrapper over Timetable's subject CRUD) | WORKING | `client/src/pages/ExmclSubjects.tsx:1-9` |

**EXMCL tally: 5 WORKING, 4 PARTIAL, 0 STUBBED, 4 PLANNED ONLY (13 features)**

### 2.7 Platform / Tenancy / Auth / Billing

| Feature | Status | Evidence |
|---|---|---|
| Tenant DB isolation (logical DB-per-tenant, not query filter) | WORKING | `server/src/tenancy/tenantConnectionManager.js:24-25` |
| Tenant resolution (subdomain/header) | WORKING | `server/src/tenancy/resolveTenantFromRequest.js:44-113` |
| Tenant context middleware | WORKING | `server/src/tenancy/tenantContextMiddleware.js:72-135` |
| Tenant provisioning (with rollback on failure) | WORKING | `server/src/tenancy/provisionTenant.js:20-126` |
| Feature-toggle-driven model loading | WORKING | `server/src/tenancy/registerTenantModels.js:91-106` |
| JWT tenant-scoped access + refresh tokens (cross-tenant rejection verified) | WORKING (tested) | `server/src/utils/jwt.js:43-55`, `server/src/middleware/auth.js:53`; covered by `jwt.scope.test.js` |
| Platform admin JWT (separate scope/secret) | WORKING | `jwt.js:20-23,57-65` |
| Role-based access control | WORKING | `middleware/auth.js:142-153`, applied broadly |
| Login/register/forgot-password/OTP flows | WORKING | `authRoutes.js:87-99` |
| Public self-service tenant signup + email OTP | WORKING (with a gap) | `server/src/tenancy/onboardingTicketService.js:36-93`, `server/src/controllers/admin/tenantAdminController.js:517-826` — tenant DB + admin user are provisioned and marked live **before** OTP verification completes; abandoned signups leave orphaned live tenant databases |
| Resend OTP | WORKING | `onboardingTicketService.js:205-269` |
| In-tenant onboarding/data-import wizard | WORKING | `server/src/routes/onboardingRoutes.js:1-42` |
| **Support tickets** | **PARTIAL** | `server/src/routes/supportRoutes.js:1-18` — tenant can file a ticket; no platform-admin route exists anywhere to triage/resolve tickets |
| Billing entitlement enforcement | WORKING | `server/src/middleware/billingEntitlement.js:97-170` |
| Billing-service ↔ main server integration | WORKING (real HTTP link, not orphaned) | `server/src/services/billingServiceClient.js:39-93`, `billing-service/src/routes/internalRoutes.js:8-27` |
| Subscription state machine | WORKING | `billing-service/src/services/subscriptionStateService.js:15-81` |
| Entitlement caching | WORKING | `billing-service/src/services/entitlementService.js:88-109` |
| Plan/coupon/addon admin CRUD | WORKING | `adminRoutes.js:255-261` |
| **Payment provider integration (Razorpay/Stripe)** | **STUBBED** | `billing-service/src/providers/razorpayAdapter.js:16-51` — `createPaymentLink` fabricates a URL with no network call; `fetchPaymentStatus` unconditionally returns `captured`. No real gateway is ever called. Real money never moves. |
| Webhook processing | WORKING (logic), but feeds a closed simulation | `billing-service/src/controllers/webhookController.js:44-59` — idempotent, well-written, but nothing external ever calls it since no real gateway exists |
| Invoice generation | PARTIAL | `billing-service/src/services/invoiceService.js` — real model-backed service, scope of rendering not fully verified |
| Billing self-service (tenant-facing "pay now") | WORKING (UI), fake charge | `server/src/routes/billingRoutes.js:1-15` — flow completes but ultimately hits the stubbed adapter |

**Platform/Billing tally: 21 WORKING, 2 PARTIAL, 2 STUBBED, 0 PLANNED ONLY (25 features)**

### 2.8 Client-only gaps not captured above

| Feature | Status | Evidence |
|---|---|---|
| Activities (Houses/Clubs) | STUBBED | `client/src/pages/Activities.tsx:16-49` — pure in-memory React state, no service import at all, data lost on refresh |
| Performas | PLANNED ONLY | `client/src/pages/Performas.tsx:1-53` — hardcoded roadmap copy, zero data fetching |
| Umcs | PLANNED ONLY | Same static-placeholder pattern |
| PwdInfo | PLANNED ONLY | Same static-placeholder pattern |

Excluded from counts as non-product-features (confirmed dev/demo or static-content pages, not gaps): `DialogShowcase`, `DropdownExamples` (component-library demo pages, live-routed but not product features), `CBSEPortals` (static external-link directory, works as designed), landing/marketing pages, `Pricing`.

**Client-only tally: 0 WORKING, 0 PARTIAL, 1 STUBBED, 3 PLANNED ONLY (4 features)**

### Event bus / "shared kernel" reality check (CLAUDE.md architecture claim)

The event bus is **real, working code** — not aspirational — but far narrower than documented:
- Implementation: `server/src/events/eventBus.js:22-58` (genuine EventEmitter, async dispatch, per-listener error isolation).
- Of 8 defined event names (`server/src/events/eventNames.js:9-23`), only **5 are ever emitted**. `core:subject:updated` and `exam:seatingplan:generated` are defined but never fired anywhere in the codebase (confirmed by repo-wide grep).
- **Student has no events at all** — cross-module sync for students uses a direct synchronous function call (`studentController.js:190-241`), not the event bus, contradicting the "event-driven cross-module communication" principle for this entity.
- The one path that is fully wired end-to-end (Teacher deactivate/delete → Timetable snapshot + Duty cascade) is **never triggered from the UI**, because every UI entry point to teacher deletion uses `uiOnlyDelete` and calls no API at all (§2.3).

---

## 3. Domain Depth Check

**Verdict: genuine CBSE-specific domain logic exists, concentrated almost entirely in the CNTR (exam-centre) module. Everywhere else (STDNT, ATTND, and especially EXMCL) is generic CRUD with a CBSE-styled skin.**

Concrete hardcoded CBSE rules found (with evidence):
- **24 candidates per exam room** — `server/src/utils/roomCalculator.js:1` (`CANDIDATES_PER_ROOM = 24`). Note: the `Room` model has its own `capacity` field (default 24) that is **never actually read** by the allocation algorithm — the constant always wins, so per-room capacity configuration is decorative.
- **No-room-repeat-across-dates rule** for candidate seating — `server/src/utils/seatingPlanBuilder.js:672-796`.
- **No-repeat-candidate-across-dates rule** for invigilator duty assignment (CBSE Rule 2) — `server/src/controllers/dutiesController.js:194-339`.
- **QP-code rotation sequence (1,2,3)** for seating charts — `seatingPlanBuilder.js:1310-1316`.
- **Fixed CBSE answer-sheet catalogue** (32-page Red/Blue by class, Graph 40-page, Supplementary Yellow/Pink, Blind 32-page, Drawing 21-page) — `server/src/utils/answerSheetTypes.js:7-96`.
- **Class-based room-start rotation rule** — `seatingPlanBuilder.js:634-657`.
- **CBSE 9-point grading bands (A1–D, collapsed E)** in report cards — `server/src/controllers/reportCardController.js:11-29`, but missing the real E1/E2 split and the mandatory Co-Scholastic Area.
- **Board/school/centre code constants** (`BOARD_CODE:'30'`, hardcoded fallback school/centre codes) — `server/src/utils/constants.js:85-89` — appear to be **dead leftovers** from an earlier single-tenant build; the live code paths read `CentreDetail` per-tenant instead.
- **A literal single-school fallback baked into the seating algorithm**: `seatingPlanBuilder.js:20-22` — `schoolName = 'INTERNATIONAL BHARTI SCHOOL, ROHTAK'`, address `'Gohana Road, Rohtak'`, centre no. `'827403'`, used whenever a tenant hasn't yet filled in `CentreDetail`. This is a genuine risk: a freshly onboarded school that skips the centre-details step could get another (real) school's identity printed on its seating-plan PDFs.

**What a school genuinely could NOT do with Excel + Google Forms:**
- The seating-plan generator's constraint-satisfaction logic (no-room-repeat, no-invigilator-repeat, shared-room remainder merging, class-day rotation, QP-code cycling) is real combinatorial work that would be extremely tedious to hand-build in a spreadsheet for a large centre (hundreds of candidates across many rooms and days). This is the one part of the system that's automating actual judgment/complexity, not just digitizing a form.
- The duty-assignment backtracking solver (CSP-style auto-assignment respecting multiple simultaneous constraints) is similarly non-trivial.
- CBSE datesheet/candidate PDF/OCR parsing removes a genuinely tedious manual re-typing step.

**What's just digitized CRUD, not automated judgment:**
- Student, Teacher, Subject management — plain forms over a database, no more sophisticated than a well-built spreadsheet + validation.
- EXMCL (internal exams) as it stands: marks entry, a flat percentage/total, and a hardcoded grade lookup — this is exactly what a school already does in Excel today; the parts that would differentiate it from Excel (per-subject weightage, co-scholastic grading, term-blended CCE formula) are the **stubbed/planned pieces** (Marks Distribution page, Co-Scholastic Area).
- Billing/subscription management, while real from an SaaS-plumbing perspective, has no actual payment gateway wired in — it's a demo of a billing system, not a working one.

### Multi-tenancy

**Genuinely multi-tenant at the database level** — each tenant gets its own logical MongoDB database (not a shared collection with a `tenantId` filter), resolved via subdomain/header and enforced by both the connection layer and JWT tenant-scope checks (`server/src/middleware/auth.js:53`). This is real isolation, materially better than the "single shared table + filter" pattern many prototypes use — see §4 for the one architectural caveat (shared underlying DB credential/connection pool across tenants).

### Configurable vs. hardcoded

| Hardcoded | Configurable |
|---|---|
| Candidates-per-room (24) | Centre details (school name, address, packing/dispatch config) — per tenant |
| CBSE grading band cutoffs | Answer-sheet types (fixed catalogue, not tenant-editable) |
| QP-code sequence (1,2,3) | Subjects, exam definitions, datesheets |
| Board code ('30') — but dead/unused | Bell timings, timetable rules |
| Single-school fallback identity (dead-code risk) | Feature toggles per tenant |

---

## 4. Technical Risk / Debt

### Security (ranked by severity)

1. **Auth bypass on School Profile routes** — `server/src/routes/schoolProfileRoutes.js:1-11` never applies the `protect` middleware every sibling route file uses. Since `tenantContextMiddleware` only resolves the tenant from hostname and doesn't authenticate the user, anyone hitting the correct tenant host can read/write school profile data and upload a logo with **no valid JWT**.
2. **Payment provider is fully mocked** — `billing-service/src/providers/razorpayAdapter.js:16-51`. No outbound call to Razorpay/Stripe exists anywhere. If anyone assumes "billing is live," they're wrong — no money moves, ever, in the current code.
3. **Platform JWT silently falls back to the tenant JWT secret** if `PLATFORM_JWT_SECRET` is unset — `server/src/utils/jwt.js:5` (`process.env.PLATFORM_JWT_SECRET || process.env.JWT_SECRET`). No startup assertion catches a missing env var; a leaked tenant secret compromises platform-admin auth too.
4. **Tenant provisioned and marked live before OTP/email verification** — `tenantAdminController.js:530-539` creates a real tenant DB + admin user during signup **start**, before OTP is checked. Bounded by rate limiting (5/hr/IP) but can still accumulate abandoned live tenant databases.
5. **Single shared Mongo connection/credential across all tenant databases** — `tenantConnectionManager.js:24-25` uses one `useDb()` call per tenant on a shared connection, not per-tenant credentials/ACLs. Logical isolation is real; credential-level isolation is not — a compromised app process has driver-level reach to every tenant DB.
6. **`mongoSanitize({ allowDots: true })`** (`app.js:163-165`) is a deliberate but real trade-off that narrows NoSQL-injection protection to support dotted subject names like "I.T."
7. **Weak default seed credentials** (`admin@example.com/admin123`, etc., `server/src/seeders/index.js:24-36`) — low risk unless the seeder is ever run against a shared/real environment.
8. Local `.env` files with live-looking Atlas credentials exist on disk but are correctly `.gitignore`'d and confirmed **not committed to git** — not a current leak, but the same DB user/password is reused across `server/.env` and `billing-service/.env`, widening blast radius if either host is compromised.
9. No hardcoded API keys, `eval()`, `child_process`, or TLS-verification bypasses found anywhere in the repo.

### Test coverage

- **Server: 12 test files** covering a narrow slice of ~356 files. By directory: controllers ~6% (3 of 51 files have any test), models 0%, routes 0%, services 0%, utils ~10% (3 of 29). No PDF generation, OCR import, seating-plan/dispatch/answer-sheet controllers (beyond one duty-assignment function), or Mongoose validation logic is tested.
- **Client: 0 test files.** **Admin: 0 test files.** **Billing-service: 0 test files.**
- Overall: automated testing exists for a handful of security/tenancy-critical code paths (JWT scope, onboarding tickets, password reset, duty assignment, seating-plan rotation) and essentially nothing else. This is a codebase that is untested outside a few hand-picked hot spots.

### Scalability blockers

- **PDF generation is synchronous in the request cycle** despite BullMQ/ioredis being installed and used elsewhere. `server/src/utils/pdfGenerator.js:48` launches a fresh Puppeteer/Chromium instance **per call**, and `reportCardController.js:196` (`generateBulk`) blocks an HTTP request on rendering an entire class's report cards inline. Same pattern in `dispatchSlipController.js` and `form66TxtToPdf.js:22`.
- **OCR runs synchronously in-request** — `datesheetController.js:250` (`Tesseract.recognize`) blocks the request thread.
- The BullMQ queue **is real and used, but only for attendance processing** (`server/src/queues/attendanceQueue.js`, `server/src/workers/attendanceWorker.js`) — it's a single-purpose integration, not a general async layer, and degrades to "silently unavailable" (not queued) if Redis is down.
- **N+1 query patterns in bulk import paths**: student import (`studentController.js:824`), subject import (`subjectController.js:320`), teacher import (`teacherController.js:768`), candidate subject-linking (`candidateController.js:660-679`) — all do one DB round-trip per row instead of `$in`/`bulkWrite`/`insertMany`. A bulk import of N rows costs O(N) sequential round-trips.
- **6 of 51 models have no index defined**: `BellTimingVersion`, `DutyAllocationSetting`, `OnboardingSession`, `Room`, `SchoolProfile`, `TimetableVersion` — `Room` and `TimetableVersion` are the two that could matter under real load (seating-plan generation, timetable rendering).
- **In-memory-only state that won't survive a restart or scale across instances**: billing-entitlement cache (`billingEntitlement.js:4`, 45s TTL Map), tenant-identity cache (`tenantUserDirectoryService.js:4`), and `express-rate-limit`'s default in-memory store (no `store:` option configured, `app.js:121-134`) — on a multi-instance deployment, rate limits are enforced per-instance (effective limit = configured max × instance count) and reset on every restart.

### Prototype-smell / demo-grade signals

- Very low TODO/FIXME density (1 total) — but the one TODO (`server/server.js:50`) documents an entire disabled feature (calendar) shipped mid-debug and never re-enabled.
- Several `catch` blocks log-and-swallow errors, including one that silently drops partial candidate-subject-linking failures while still returning HTTP 201 success (`candidateController.js` ~679-681).
- The hardcoded single-school fallback identity in the seating-plan builder (§3) is a direct leftover of an original single-tenant build that could leak into a new tenant's exam-day PDFs.
- `capabble-landing` includes a committed `.next` dev build directory (hundreds of thousands of lines of generated chunks) — build artifacts shouldn't be in version control; this alone inflated a naive LOC count by 3.5x.

---

## 5. What Would It Take to Ship to One Real School

### To run one CBSE school's exam cycle end-to-end (question paper → report card)

Blocking gaps, in the order a real cycle would hit them:
1. **EXMCL marks distribution / per-subject weightage** — currently a placeholder page with no backend. Needed before internal exam results mean anything beyond a flat sum. Estimate: **1–2 weeks** (schema + UI + calculation engine).
2. **EXMCL grading fix (E1/E2 split, Co-Scholastic Area, attendance/remarks binding)** — the report card as it stands isn't a CBSE-compliant document. Estimate: **1 week**.
3. **Report-card bulk-download selection bug** (ignores checked students, generates whole class) — small but would actively produce wrong output today. Estimate: **1–2 days**.
4. **Question papers / syllabus / award list** are pure placeholders — decide whether these are in scope for "v1 to one school" or explicitly deferred; if in scope, **2–3 weeks** for a minimal version of each.
5. **Room capacity should read from `Room.capacity`, not a hardcoded 24** — matters the moment a real school has rooms of varying size. Estimate: **2–3 days**.
6. **Remove/replace the hardcoded single-school fallback identity** in `seatingPlanBuilder.js` before onboarding any second real school — trivial fix, but must happen before go-live. Estimate: **half a day**.
7. **Remuneration** is a rate table with no actual calculation — if the school needs to actually pay invigilators through the system (not just look up a rate), this needs building from scratch. Estimate: **1–2 weeks**.

### To trust it with real student data (safety, backup, access control)

1. **Fix the School Profile auth bypass** — trivial, must-fix, **hours not days**.
2. **Remove the platform-JWT-secret fallback**; require both secrets to be set at boot (fail loudly, not silently). **1 day**.
3. **No backup/restore strategy is visible in this codebase** — MongoDB Atlas presumably has its own backup story, but there's no documented/tested restore procedure, no soft-delete-then-purge window for accidental deletions (students are hard-deleted immediately, `studentController.js:606`). Needs a policy decision + implementation: soft-delete with a grace period, or a documented Atlas point-in-time-restore runbook. **3–5 days** for soft-delete on Student at minimum.
4. **Payment stub must not be exposed to a real customer** as if it charges real money — either wire a real Razorpay/Stripe integration or clearly gate billing UI as "manual invoicing only" until it does. **2–4 weeks** for a real gateway integration, or **1 day** to honestly relabel the current flow as manual.
5. **Onboarding-before-verification** tenant creation should be moved to *after* OTP success, or abandoned tenants need a cleanup job. **2–3 days**.
6. Some minimal automated test coverage on the write paths that touch real student/tenant data (currently 0% on models/routes) would materially reduce risk of a silent regression corrupting data across tenants. Not blocking for one school, but a fast-following priority.

### Top 5 blockers, ranked by priority (not by ease)

1. **EXMCL is not board-compliant yet** (marks distribution, grading bands, co-scholastic section) — this is the module CLAUDE.md says is "next up," and it's the one place the domain logic that actually differentiates this product from a spreadsheet is still missing.
2. **School Profile auth bypass** — a live, exploitable access-control gap, trivial to fix, must happen before any real tenant is onboarded.
3. **Hardcoded single-school identity fallback** — a data-integrity/reputational risk (one school's PDFs showing another school's name) that's also trivial to fix but easy to overlook.
4. **Payment system is entirely simulated** — anyone treating "Billing module: done" at face value would be wrong; this needs an explicit decision (build real integration vs. relabel as manual billing) before it's shown to a paying customer.
5. **Zero test coverage on the actual data-mutation paths** (models, routes, most controllers) — not a blocker to a first pilot school, but the single biggest risk multiplier once a second school (real multi-tenancy pressure) or real exam-day load arrives.

---

## 6. Honest Summary Table

| Module | % Complete (working / total features) | Production-ready? | Biggest gap |
|---|---|---|---|
| CNTR (Exam Centre) | 23/30 = **77%** | **Partial** — core workflows (seating, duties, answer sheets, Form 66) are genuinely solid and CBSE-specific; remuneration and legacy room routes are stubs | Remuneration is a rate table, not a payroll calculation; hardcoded single-school fallback identity |
| STDNT (Students) | 5/7 = **71%** | Y for CRUD, **N** as an "independent module" | No independence from CNTR — contradicts CLAUDE.md's core architectural principle |
| STAAF (Staff) | 2/4 = **50%** | **N** | Delete is UI-only (fake); no dedicated module — matches its documented "Planned" status |
| ATTND (Attendance) | 3/5 = **60%** | **N** | No reporting/export at all; cross-module coupling instead of clean boundary |
| TMTBL (Timetable) | 8/11 = **73%** | **Partial** — generation engine and versioning are genuinely strong | Substitution scheduling is a checkbox mockup with no backend; silent teacher-shortName sync bug |
| EXMCL (Internal Exams) | 5/13 = **38%** | **N** | Marks distribution, question papers, syllabus, award list are all placeholders; grading is CBSE-flavored but not compliant |
| Platform/Tenancy/Billing | 21/25 = **84%** | **Partial** — tenancy/auth genuinely production-grade; billing plumbing real but payments are fake | Payment provider is fully mocked — no real money ever moves |
| Client-only pages (Activities/Performas/Umcs/PwdInfo) | 0/4 = **0%** | N | All either UI-only or placeholder |

**Overall repo-wide: 68/100 counted features = 68% "working" by count** — but this number overstates readiness, because the module CLAUDE.md flags as the current priority (EXMCL) is the least complete at 38%, and several "WORKING" items above carry documented caveats (bulk report-card download bug, unbounded marks entry, dead dispatch-status enum).

---

## 7. Raw Numbers

- **Total features counted: 100** — 68 WORKING / 13 PARTIAL / 9 STUBBED / 10 PLANNED ONLY.
  (Methodology note: this is a feature-level count assembled from module-by-module code audits, not a formal requirements-traceability count; borderline "WORKING but with a documented gap" items were counted as WORKING with the gap noted in §2. A stricter count that reclassified every "WORKING (with real gaps)" item as PARTIAL would materially lower the working percentage — treat 68% as an upper bound, not a precise figure.)
- **Total files (core product, excl. node_modules/build output): 659** — server 356, client 241, admin 29, billing-service 33. (+40 files / 9,409 LOC in capabble-landing marketing site, excluded from the product count.)
- **Total LOC (core product): 136,540.**
- **Test file count: 12**, all in `server/` — 0 in client, admin, or billing-service.
- **Days since last meaningful commit: 86** (last commit 2026-04-30 → audit date 2026-07-25; that commit itself was substantive — report-card generation — not a trivial README/config edit).
- **Unmaintained/stale external dependencies:**
  - `xss-clean` — last published **2023-06-02** (~3 years stale). Well-known in the Node ecosystem as unmaintained; still actively used in the security middleware chain (`app.js:168`).
  - `hpp` — last published **2022-06-18** (~4 years stale), still active in the middleware chain (`app.js:171`).
  - `express` pinned at 4.x while 5.x has been the current major for some time.
  - `mongoose` pinned at 8.x vs. current 9.x; `react`/`react-router-dom` similarly one-to-several majors behind current.
  - None of these are exploited/known-CVE-flagged in this audit — flagged for staleness/maintenance risk, not confirmed active vulnerabilities.
