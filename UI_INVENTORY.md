# UI_INVENTORY — client/ audit

Static analysis (grep + file reads) of `client/src`; nothing was rendered and no code was changed. Sections: 1 App shell · 2 Routes · 3 Shared components · 4 Visual tokens · 5 Status vocabularies · 6 Mobile · 7 Inconsistencies.

---
# SECTION 1 - App shell

## 1.1 Files
| File | Lines | Role |
|---|---|---|
| components/layout/Layout.tsx | 156 | Flex shell: `<Sidebar>` + drag-resize handle + (`<Header>`, `<BillingBanner>`, `<main id="app-main-scroll" class="animate-page-enter"><Outlet/>`). Wrapped in `AttndMatrixModeProvider`. Root: `flex h-screen bg-gray-50 dark:bg-gray-900`. |
| components/layout/Sidebar.tsx | 2224 | Module switcher + nav tree (hard-coded array of inline-SVG items) + account footer menu. |
| components/layout/Header.tsx | 870 | Sticky top bar (h-16, z-40). |
| components/layout/BillingBanner.tsx | 51 | Banner under header driven by `user.billing`. |

### Layout.tsx details
- Sidebar widths: default 208, min 176, max 420, collapsed 80. Collapse state is local `useState` (not persisted); width persisted in localStorage `layout:sidebarWidth:v2` + `layout:sidebarWidthManual:v2`.
- "fitToContent" mode (default): Sidebar measures its widest nav row via `useLayoutEffect` and reports width up via `onContentWidthChange`. Drag the 12px handle on the sidebar's right border to go manual; double-click handle resets to fit-to-content. Handle shows a 3px `bg-blue-500/80` line on hover/drag.
- No mobile/responsive drawer: sidebar is always rendered inline (collapsed or expanded). No breakpoint-based hiding.

### Header.tsx details
- `<header class="h-16 sticky top-0 z-40 bg-white dark:bg-secondary-900 border-b border-secondary-200 ...">`.
- Left: sidebar collapse toggle button, vertical divider, optional Back button (`backTo`), page title + subtitle (huge route -> {title, subtitle} lookup table built inside the component, ~lines 90-400; a separate "dashed primary" chip for "Set up centre details" when centre name missing and `canAccessCentreDetails`).
- Timetable-only widget: "Periods per week" inline editor (via `useTimetable`).
- Right: "Complete Onboarding" amber pill (from `useOnboardingStatus`, hidden on /onboarding), Academic Session badge (primary-50 pill with calendar icon + `currentSession`), dashboard date label (lg+), `AttndModeSwitch` (attendance matrix mode), page-aware search input (md+, w-28/32), notifications bell with red ping dot + dropdown panel (`shadow-elegant`, `animate-fade-in-down`; list is static/mock `notification` objects).
- Only feature-gating in Header: `isFeatureEnabledForPath('/centre-details', featureToggles)`.
- NO theme (dark/light) toggle exists in Header or anywhere (see 4.9).

### BillingBanner.tsx (full rules)
Reads `user.billing` (type `BillingSnapshot {accessMode:'full'|'core_only'|'read_only', state, planCode, trialEndsAt, graceEndsAt, isReadOnly}`, types/auth.ts). Returns null if no billing or (`accessMode==='full'` and state not `past_due_grace`/`grandfathered`).
| Condition | Tone | Text |
|---|---|---|
| accessMode=core_only | amber (`bg-amber-50 border-amber-200 text-amber-800` + dark variants) | "Your trial currently includes core modules only. Upgrade to unlock all modules." |
| accessMode=read_only | red (`bg-red-50 border-red-200 text-red-800` + dark) | "Your workspace is in read-only mode due to billing status. Complete payment to restore full access." |
| state=past_due_grace | amber | "Payment is pending. You are in grace period..." |
| state=grandfathered | amber | "Your workspace is in grandfathered access period. Billing setup is required before expiry." |
Layout: `mx-4 mt-3 mb-1 rounded-lg border px-4 py-3 text-sm`, flex row with text + "Open Billing" `<Link to="/billing">` (`rounded-md bg-white/70 dark:bg-black/30 px-3 py-1.5 text-xs font-semibold`). No dismiss button.

## 1.2 Module switcher (Sidebar.tsx ~1579-1680)
- Top-of-sidebar button: 32px module icon (PNG/SVG from assets) + `ABBR` (text-[13px] bold) + title (text-[11px], truncate) + chevron (only if >1 accessible module). Wrapper has `bg-sky-50` halo behind a white ring-1 button (hard-coded sky, not themed).
- Dropdown ("Switch Module", 9px uppercase header): rows for `MODULE_REGISTRY.filter(m => accessibleModules.has(m.id))`; 24px icon, `ABBR` + title, active row `bg-primary-50 dark:bg-primary-900/20` + 1.5px primary dot. Collapsed sidebar: dropdown opens to the right (`left-full ml-3 w-64`). Click-away layers: in-sidebar fixed overlay + portal overlay (`createPortal` to body, `z-40`) for the rest of page. `animate-fade-in-up`, `max-h-[min(52vh,360px)]`.
- `selectedModule` state default `'cntr'`; `useEffect` syncs it from `getModuleForPath(location.pathname)` (ignores `core`). Choosing a module: `navigate(getFirstEnabledPathForModule(mod.id, toggles) || mod.defaultRoute)`.
- Registry (constants/moduleRegistry.ts), in switcher order: STDNT Student Management `/stdnt/stdntboard`; STAAF Human Resource Management `/staaf/overview`; ATTND Attendance Management `/attnd/attndboard`; ACDMC Academics `/acdmc/lesson-plan`; TMTBL Timetable Management `/school-hub`; ACTVT Activities `/actvt/houses`; MDCL Medical Clinic `/mdcl/cases`; ASETS Asset Management `/asets/dashboard`; CPITL Capital & Finance `/cpitl/dashboard`; TRNST School Transport `/trnst`; EXMCL Internal Exams `/exmcl/centre-details`; CNTR Exam Centre Control `/dashboard`. Icons are PNG (CNTR, EXMCL, TMTBL, STDNT, STAFF, ATTND, TRNST, ACDMC, ACTVT, MDCL, ASETS) and one SVG (CPITL.svg) in src/assets.

## 1.3 How gating works (featureToggles + billing)
Data: `user.featureToggles: Record<string,boolean>|null` and `user.billing` come from login/refresh payload into `authSlice` (`selectUser`, `selectBillingSnapshot`). `tenantRuntime.ts` is NOT involved in gating (only tenant slug / API base URL resolution: `?tenant=` query > localStorage `tenantSlug` > JWT payload; local API `http://localhost:5000/api`, prod `https://{ROOT_API_DOMAIN}/api`).

**constants/tenantFeatureCatalog.json** (~74 entries, 14.8KB): each `{key,label,path,group,module,prefixes[],fallbackPriority?}`. Modules: core, timetable, stdnt, staaf, attnd, trnst, acdmc, actvt, mdcl, asets, cpitl, cntr, exmcl. Keys per module:
- core: dashboard, billing, account_settings, help_support
- timetable: school_hub(opt-in), timetable_classes, _subjects, _bell_timings, _class_wise, _teacher_wise, _formats, _period_allocation (prefixes: period-distribution/distribution/period-allocation/subject-allocation/departments)
- stdnt: stdnt_classes, stdnt_subjects, stdnt_student_info (stdntboard + student-info), stdnt_students, almni_directory (/stdnt/alumni, /almni)
- staaf: staaf_staff_members (prefix /staaf = whole module)
- attnd: attnd_staff_attendance, attnd_student_attendance
- trnst: trnst_transport (/trnst); acdmc: acdmc_academics (/acdmc); actvt: actvt_activities (/actvt); mdcl: mdcl_clinic (/mdcl); asets: asets_dashboard (/asets, whole module)
- cpitl: cpitl_dashboard, cpitl_fees (fee-structures, collection, students, fee-slips, payments, settings), cpitl_expenses (expenses, operating, fuel, electricity, infra, budgets), cpitl_payroll (salary, payroll)
- cntr (18+): centre_details, exam_functionaries (+/teachers,/staff), centre_guidelines, cbse_circulars, cbse_portals, subjects, undertaking, datesheets, form66, examrooms (+/rooms), answersheets, seatingplan, duties, attendance, pwd_info, umcs, stickers, performas, candidates, dispatch_slip, remuneration
- exmcl (21): exmcl_centre_details, _exam_functionaries, _centre_guidelines, _exams, _result, _report_card, _award_list, _admit_cards, _question_papers, _syllabus, _marks_distribution, _subjects, _datesheets, _examrooms, _answersheets, _seatingplan, _duties, _attendance, _performas, _candidates, _cbse_registration

**constants/featureAccess.ts** semantics:
- `isFeatureEnabledForPath(pathname, toggles)`: resolves path to first catalog rule whose prefix matches (exact or `prefix/`); no match -> TRUE (ungated). Default-allow: `toggles[key] !== false`. Opt-in set `{school_hub}`: must be exactly `true`.
- `getAccessibleModules(toggles)`: set of non-core modules having >=1 catalog entry whose `path` is enabled. Drives module-switcher list (so a module with all keys false disappears).
- `getFirstEnabledPathForModule`, `getFirstEnabledPath` (uses `fallbackPriority` order; used for redirect), `getModuleForPath`.
- Catalog gaps = always visible when module active: /time-table/teachers, /time-table/generate, /time-table/substitution, /time-table/versions, /attnd/attndboard, /exmcl/* routes are all covered, /school-hub nav item is not rendered at all (see below).

**Sidebar filtering (Sidebar.tsx ~1415-1490)**: every nav entry is first filtered by `entry.module === activeModule` (or core/undefined), then each href by `isPathAllowed`. Disabled items are HIDDEN (removed from tree); a group with zero allowed children and no allowed own href is removed; a group whose own `href` is disabled is removed wholesale. Account-menu items Account Settings / Billing / Help & Support are conditionally rendered by `isPathAllowed('/account-settings'|'/billing'|'/help-support')`.
Groups flattened into top-level items (accordion removed): "School Hub", "Centre Details", "Centre Records" (both cntr and exmcl variants). Hence the "School Hub" parent link and "Time Table" sub-group header are never shown; only the 12 timetable leaf links appear. All remaining groups (CPITL Income/Expenses/Payroll) are auto-expanded (`openGroups` set to true on each filter change); header click toggles + navigates to group href if any.

**Billing accessMode**:
| accessMode | Sidebar | Route level | Banner |
|---|---|---|---|
| full | all (per toggles) | per toggles | none (unless past_due_grace / grandfathered -> amber) |
| core_only | NOT hidden/locked (items still show) | `ProtectedRoute` redirects any path not under `/`(exact), `/dashboard`, `/candidate-details`, `/candidates`, `/subjects`, `/datesheets`, `/billing` to `/billing?reason=core-only` | amber text |
| read_only | no change | no client enforcement (grep: `isReadOnly` unused outside type; presumably server 403s on writes) | red text |
- Toggle-off route hit: `ProtectedRoute` redirects to `getFirstEnabledPath(toggles)` or shows full-screen "Page disabled by admin" card (rounded-2xl, white/gray-800).
- Extra toggle checks outside shell: App.tsx:182 (`timetable_classes !== false`), SupportForm/HelpSupport (`getSupportModules`), CpitlDashboard (`expensesEnabled`), StaffSalaryCard (cpitl + /cpitl/salary).
- **There is NO locked/padlock/upsell nav UI anywhere.** Nav items are either visible or hidden. "Read-only" is only a banner. Locked-style visual = none (so a design for lock states would be new work).

## 1.4 Sidebar visuals / behaviour
- Container: `bg-white dark:bg-secondary-900 border-r border-secondary-200 dark:border-secondary-700`, `z-50`, `h-[100vh]`, transitions width 300ms.
- Item row: `text-[12px] font-medium rounded-lg px-2 py-1.5`; icon 20px (top level) / 16px (sub) / 14px (nested leaves, `w-3.5`); active = `bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400` + 4px-wide left bar `bg-primary-500 rounded-r-full`; hover = `hover:bg-secondary-50 dark:hover:bg-secondary-800/50`. Icon colour: active primary-600, idle secondary-400. Nested items indent with `ml-3 pl-3 border-l-2 border-secondary-100`. Focus: `focus-visible:ring-2 ring-primary-500`.
- Collapsed (80px): 40x40 centred icon buttons with `title` tooltip only (no custom tooltip), SVGs forced to 4.5 units; badges become a 18px primary-500 bubble with 2px white border at top-right.
- Count badge: pill `px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm` (active: primary-100/700; idle: secondary-100/600). Values from `useSidebarCounts(access)` via `toBadgeValue` (null or <=0 -> no badge). Counts only exist for CNTR items: examFunctionaries, subjects, datesheetDays (datesheets), rooms (Exam Room/Hall), answerSheets, candidates. Each count query is skipped if the matching path is toggled off (`sidebarCountsAccess`). Query invalidated 1s after visiting relevant pages.
- Footer account button: school logo avatar (40px, white w/ ring) + school name + "Aff. no / CBSE code" lines + chevron; dropdown (portal'd overlays) has Account Settings (NavLink), Billing (NavLink), Switch Session (-> clearSession + `/select-session`), Help & Support, Sign out (dispatch logout). Tenant-logo-derived brand colouring applies here (section 4.10).
- No role-based (admin vs data_entry_operator) gating in Sidebar/Header (`role` only used as a fallback display name). No `roles`, `hidden`, `locked` field in nav item types. NavItem = `{name, href, icon, badge: string|null, module?}`; NavGroup = `{name, icon, href?, children, module?}`; sub-group nested one level.
- Icons: all inline Heroicons-outline style `<svg>` (stroke currentColor, strokeWidth 2) except Functions (lucide `PartyPopper`). Icon names below are my best visual guess.

## 1.5 Complete nav tree (order as authored in Sidebar `navigation` array; only active module's entries render, in this order). Badge column = `useSidebarCounts` unless "-".

### TMTBL (module `timetable`) - parent "School Hub" `/school-hub` and sub-group "Time Table" are flattened away
| # | Label | Route | Icon | Feature key / gating |
|---|---|---|---|---|
| 1 | Teachers | /time-table/teachers | user | none (no catalog rule) |
| 2 | Classes | /time-table/classes | academic-cap | timetable_classes |
| 3 | Subjects | /time-table/subjects | book-open | timetable_subjects |
| 4 | Period Distribution | /time-table/period-distribution | table/rows | timetable_period_allocation |
| 5 | Departments | /time-table/departments | grid-4 | timetable_period_allocation |
| 6 | Bell Timings | /time-table/bell-timings | clock | timetable_bell_timings |
| 7 | Generate | /time-table/generate | sparkles | none |
| 8 | Class Wise | /time-table/class-wise | grid-4 | timetable_class_wise |
| 9 | Teacher Wise | /time-table/teacher-wise | user | timetable_teacher_wise |
| 10 | Substitution | /time-table/substitution | refresh | none |
| 11 | Versions | /time-table/versions | document | none |
| 12 | Formats | /time-table/formats | rectangle+lines | timetable_formats |
(school_hub is an opt-in key; the "/school-hub" landing is TMTBL defaultRoute but has no sidebar row.)

### STDNT (`stdnt`)
Stdntboard /stdnt/stdntboard (home icon; key stdnt_student_info) | Students /stdnt/students (users; stdnt_students) | Classes /stdnt/classes (academic-cap; stdnt_classes) | Subjects /stdnt/subjects (book-open; stdnt_subjects) | Alumni Directory /stdnt/alumni (academic-cap w/ tassel; almni_directory)

### STAAF (`staaf`; all one key staaf_staff_members, prefix /staaf)
Overview /staaf/overview (bar-chart) | Organisation Structure /staaf/organisation-structure (org-chart) | Teaching Staff /staaf/teaching-staff (mortarboard) | Sports Coach /staaf/sports-coach (figure) | Admin Staff /staaf/admin-staff (user) | Drivers /staaf/drivers (car) | Conductors /staaf/conductors (ticket) | Security /staaf/security (guard) | Recruitment /staaf/recruitment (user-plus)

### ATTND (`attnd`)
Attndboard /attnd/attndboard (bar-chart; ungated) | Staff Attendance /attnd/staff-attendance (clipboard-check; attnd_staff_attendance) | Student Attendance /attnd/student-attendance (clipboard-check; attnd_student_attendance) - NOTE "Student Attendance" is authored later in the array (after Transport) but still shows under ATTND, 3rd.

### ACDMC (`acdmc`; key acdmc_academics)
Lesson Plan /acdmc/lesson-plan (book-open) | Homework /acdmc/homework (document) | Assignment /acdmc/assignment (clipboard) | Quiz /acdmc/quiz (question-circle) | Curriculum /acdmc/curriculum (book)

### ACTVT (`actvt`; key actvt_activities)
Activity Board /actvt/board (columns) | Houses /actvt/houses (home) | Student Council /actvt/student-council (star) | Clubs /actvt/clubs (users) | Tours & Trips /actvt/tours (globe) | Sports /actvt/sports (runner) | Functions /actvt/functions (lucide PartyPopper) | House Ranking /actvt/ranking (trophy) | Certificates /actvt/certificates (badge-check)

### MDCL (`mdcl`; key mdcl_clinic)
Medical Cases /mdcl/cases (clipboard+plus) | Medical Supplies /mdcl/supplies

### ASETS (`asets`; key asets_dashboard, whole module)
Asset Overview /asets/dashboard | All Assets /asets/assets | Categories /asets/categories | Locations /asets/locations | Allocations /asets/allocations | Transfers /asets/transfers | Maintenance /asets/maintenance | Stock / Store /asets/stock | Audits /asets/audits | Vendors /asets/vendors | Procurement /asets/procurement | Disposal /asets/disposals | Reports /asets/reports | ASETS Settings /asets/settings

### CPITL (`cpitl`) - 3 real accordion groups (header icon + chevron, all auto-open)
- **Income** (no group href): Fee Dashboard /cpitl/dashboard [cpitl_dashboard] | Fee Collection /cpitl/collection [cpitl_fees] | Fee Structures /cpitl/fee-structures [cpitl_fees] | Receipts /cpitl/payments [cpitl_fees] | Fee Slips /cpitl/fee-slips [cpitl_fees] | Fee Settings /cpitl/settings [cpitl_fees]
- **Expenses**: Expense Overview /cpitl/expenses | Operating Costs /cpitl/operating | Fuel /cpitl/fuel | Electricity /cpitl/electricity | Infrastructure /cpitl/infra | Budgets /cpitl/budgets  [all cpitl_expenses]
- **Payroll**: Staff Salaries /cpitl/salary | Payroll Runs /cpitl/payroll  [cpitl_payroll]
(/cpitl/students is covered by cpitl_fees but has no sidebar row.)

### TRNST (`trnst`; key trnst_transport)
Transport /trnst | Vehicles /trnst/vehicles | Self Students /trnst/self-students | Routes /trnst/routes

### CNTR (`cntr`) (feature keys in brackets; Centre Details + Centre Records groups flattened -> single flat list)
1 Dashboard /dashboard [dashboard core; entry tagged cntr] | 2 Centre Info /centre-details [centre_details] | 3 Exam Functionaries /exam-functionaries [exam_functionaries] **badge examFunctionaries** | 4 Centre Guidelines /centre-guidelines | 5 CBSE Circulars /cbse-circulars | 6 CBSE Portals /cbse-portals | 7 Subjects /subjects **badge subjects** | 8 Undertaking Form /undertaking | 9 Datesheets /datesheets **badge datesheetDays** | 10 Form 66 /form66 | 11 Exam Room/Hall /examrooms **badge rooms** | 12 Answer Sheets /answersheets **badge answerSheets** | 13 Seating Plan /seatingplan | 14 Duties /duties | 15 Attendance /attendance | 16 PwD Info /pwd-info | 17 UMC's /umcs | 18 Stickers /stickers | 19 Performa's /performas | 20 Candidate Details /candidate-details **badge candidates** | 21 Dispatch Slip /dispatch-slip | 22 Remuneration /remuneration.
(Each has same-named catalog key e.g. `form66`, `examrooms`, `pwd_info`.)

### EXMCL (`exmcl`) (each key `exmcl_*`; groups flattened; NO badges)
Centre Info /exmcl/centre-details | Exam Functionaries /exmcl/exam-functionaries | Circulars /exmcl/centre-guidelines | Admit Cards /exmcl/admit-cards | Exams /exmcl/exams | Result /exmcl/result | Report Card /exmcl/report-card | Award List /exmcl/award-list | Question Papers /exmcl/question-papers | Syllabus /exmcl/syllabus | Marks Distribution /exmcl/marks-distribution | Subjects /exmcl/subjects | Datesheets /exmcl/datesheets | Exam Room/Hall /exmcl/examrooms | Answer Sheets /exmcl/answersheets | Seating Plan /exmcl/seatingplan | Duties /exmcl/duties | Attendance /exmcl/attendance | Formats /exmcl/performas | Candidate Details /exmcl/candidate-details | CBSE Registration /exmcl/cbse-registration

### Pinned account menu (footer, all modules)
Account Settings /account-settings [account_settings] | Billing /billing [billing] | Switch Session (action) | Help & Support /help-support [help_support] | Sign out (action)

---

---
# SECTION 2 - Routes by module

<!-- 02_routes_cntr_core -->
## Part 02 - Routes: public/auth, CNTR module, core/shell (client/src/App.tsx)

Router: `HashRouter` (so real URLs are `/#/dashboard`). All protected routes live under `<ProtectedRoute/>` -> `<Layout/>` (wrapped in `TimetableProvider` when `featureToggles.timetable_classes !== false`).

## Access model (applies to every row below)

- **No role gate exists in the client.** `ProtectedRoute` checks only: (1) authenticated, (2) academic session selected (else `/select-session`), (3) billing `accessMode === 'core_only'` -> only `/`, `/dashboard`, `/candidate-details*`, `/candidates*`, `/subjects*`, `/datesheets*`, `/billing*` allowed (else redirect `/billing?reason=core-only`), (4) tenant `featureToggles` per path prefix via `constants/featureAccess.ts` + `tenantFeatureCatalog.json` (disabled -> redirect to first enabled path or "Page disabled by admin"). `school_hub` is opt-in (must be explicitly `true`).
- So "Role" below = "Any tenant user (Admin or Data Entry Operator)" plus the feature-toggle key that gates it. Only role check found anywhere in client: `components/cpitl/StaffSalaryCard.tsx` (`user.role === 'admin'`), out of scope here.
- Platform-admin routes are NOT in this app (they are in `/admin`). 404 catch-all `*` renders inline "404 / Back to Home".
- `Teachers` is reused for exam-functionaries with props `hidePagination includeAllRecords uiOnlyDelete`.
- Legend - completeness: **working** = real API/hooks; **partial** = real but with broken link/mock bits; **placeholder** = static/no data.

---

## A. Public / auth / onboarding routes (top of App.tsx)

Redirect rule used by public auth routes: if authenticated -> `hasSession ? /dashboard : /select-session`.

| route | page component | purpose | main data shown | primary actions | page type | completeness | role |
|---|---|---|---|---|---|---|---|
| `/pricing` | `Pricing` | Static plan comparison for CBSE centres | 3 hardcoded cards: Lite Rs999, Plus Rs1,999 (Most Popular), Pro Rs3,999 "per exam season, billed annually"; feature bullet lists | Monthly/Yearly toggle buttons and "Start Lite / Start Plus / Get Pro" buttons - **no onClick handlers, no state** | placeholder (marketing) | placeholder (all hardcoded; buttons dead; "Cntr" logo only; not wired to billing) | public (no auth check) |
| `/` | `PublicLanding` -> `CntrLanding` / `TmtblLanding` / `StdntLanding` (chosen by `getPublicBrandVariant()`: `?brand=` query or hostname `tmtbl.*` / `stdnt.*`, default cntr) | Brand-specific marketing landing; authed users are redirected | Hero ("Manage datesheets, rooms, answer sheets, seating plans, invigilator duties, attendance and candidate records."), feature cards, mock UI previews, CTA band | Cntr: **Preview** button opens dialog with embedded brochure + "Download PDF" link + Close; Cntr/Tmtbl/Stdnt: links to `/login`, `/signup` | landing (marketing) | working (static content; no API) | public (authed -> redirected) |
| `/login` | `Login` | Tenant sign-in with tenant auto-resolution | Email-or-username + password fields; optional "Workspace Code" when logging in by username; "Stay signed in"; Verify-email OTP step (6-digit) | Sign in (`authService.resolveTenantByEmail` -> redux `login` -> `sessionService.getAvailableSessions/createSession` auto-selects current session -> `/dashboard`, else `/select-session`); Forgot Password link; verify OTP (`authService.verifyEmail`) + resend OTP; link to `/signup` | auth (form) | working | public (authed -> redirect) |
| `/forgot-password` | `ForgotPassword` | 3-step password recovery | Step email -> OTP + new password + confirm (strength rules) -> success (auto-redirect to `/login`) | `authService.resolveTenantByEmail`, `forgotPassword`, `resendForgotPasswordOtp`, `resetPassword` | auth (wizard) | working | public |
| `/signup` | `Signup` | Institution (tenant) self-signup form | Institution Code (5 digits), Affiliation No (6 digits), Institution Name, admin Email, Password + Confirm (show/hide) | `tenantSignupService.startSignup` -> navigates to `/signup/complete?ticket=...`; link back to `/login` | auth (form) | working | public |
| `/signupold` | `TenantSignupChat` | Legacy chat-style signup (name, slug/workspace code, admin email, password, confirm) | Chat bubbles, persisted in localStorage (`centre-signup-chat-v2`), slug/email/strong-password regex validation | `tenantSignupService.startSignup`; builds tenant redirect URL | auth (wizard/chat) | working (legacy, not linked from UI) | public |
| `/signup/complete` | `TenantSignupComplete` | Finish signup: verify emailed OTP and exchange ticket | `?ticket=` param; status states otp/loading/success/error; 6-digit OTP input | `tenantSignupService.exchangeTicket` (persists auth, sets credentials, -> `/dashboard`), Resend OTP (`resendOtp`); error handling for expired/used ticket, otp expired/attempts | auth (form) | working | public |
| `/select-session` | `SessionSelector` | Pick academic session (Indian Apr-Mar) after login | List of available sessions (`useAvailableSessions`, shows `exists`/current), optional "carry forward" source session | Select session, enter (`useCreateSession`, optional `useCarryForward` copies data from a prior session), then `/onboarding` if onboarding incomplete else `/dashboard` | form/wizard | working | authenticated; unauth -> `/`; already has session -> `/dashboard` |
| `/onboarding` | `OnboardingPage` -> `OnboardingWizard` | 5-step first-time data load wizard | Steps: Import Class X Candidates (PDF), Import Class XII Candidates (PDF), Upload Form 66 (Class X), Upload Form 66 (Class XII), Upload Attendance Sheets (X+XII combined, queued background job) | Upload files per step (`useCompleteStep`), `useStartOnboarding`, `useQueueAttendanceUpload` (job id stored in localStorage, progress widget on Dashboard), `useCompleteOnboarding`, open validation report | form/wizard | working | authenticated + has session (else redirects) |
| `/onboarding/validation` | `ValidationReportPage` -> `ValidationReport` | Post-import data validation report | `useValidationReport` result (refetchable) | Refresh/refetch report | document-preview (report) | working | authenticated + has session |
| `*` | inline 404 | Not-found screen | "404 Page not found" | "Back to Home" link | placeholder | working | public |

Notes: `/onboarding*` routes are outside `ProtectedRoute`/`Layout`, so they skip feature-toggle/billing gating.

---

## B. CNTR module routes (Exam Centre Control) - inside Layout

Feature-toggle key shown in the role column.

| route | page component | purpose | main data shown | primary actions | page type | completeness | role |
|---|---|---|---|---|---|---|---|
| `/centre-details` | `CentreDetails` | Centre profile + staff contacts + candidate summary | Centre Information (Centre Name, Centre No), Staff Details (Centre Superintendent, Deputy CS, Centre Clerk with contact numbers), Candidates Appearing KPIs (Total Candidates, Total Exam Days, Schools), school-wise table: Sr No, School Code, School Name, Class X Roll From/To + count, Class XII Roll From/To + count, Total | Save/Update Details (`useUpdateCentreDetailsMutation`) | settings/form + summary table | working (`useCentreDetails`, `useCentreDetailsSummary`) | any tenant user · `centre_details` |
| `/exam-functionaries` | `Teachers` (hidePagination, includeAllRecords, **uiOnlyDelete**) | Master list of exam functionaries (invigilators etc.) | Checkbox, Sr No, Teacher Name, OASIS ID (N/A for Class IV/Others), Duty Type (inline dropdown, saves via `teacherService.update`), Designation, Subject Code, Subject Name, School Code, School Name; sortable headers; filters (school, subject); search | Add (AddTeacherModal), Edit (EditTeacherModal via row), bulk "Delete Selected" (**UI-only hide - not persisted on this route**), "Template" CSV download + upload CSV/XLSX import (`teacherService.downloadImportTemplate/uploadImportTemplate`, reports created/updated/skipped/errors); Export button + ExportModal exist but are **hard-disabled (`{false && ...}`)** | list-table | working (delete is local-only here) | any tenant user · `exam_functionaries` |
| `/exam-functionaries/:id` | `TeacherDetail` | Read-only functionary profile | Personal Info (name, DOB), Contact (phone, email, emergency contact+relation), Professional (school, school code, designation), Bank (bank name, account no, IFSC), Subjects Teaching (subject code/name) | "Back to Teachers" only; reads Redux `teachers` slice (`fetchTeachers`) | detail (read-only) | working (read-only; back button label says "Teachers") | any tenant user · `exam_functionaries` |
| `/duties` | `Duties` | Assign duty functionaries per date and invigilators per room | Tabs per duty type: CS, DCS, OBR, ASI (Invigilator), ASC (CCTV), ASFM, ASFF (Frisking M/F), CLR (Clerk), CL4 (Class IV). Functionary x exam-date selection grid with max-duty counts; ASI tab: room-wise table (Sr No, Room No, Room Name, Floor, Invigilator 1, Invigilator 2, School) with date navigation | Save Functionaries (`useSaveDutySelections`), Auto/Manual allocation mode toggle (`useUpdateDutyAllocationMode`), Save room assignments (`useAssignDailyDuties`), Download room assignments / **Preview "Exam Functionary Duty Record" PDF** (react-pdf viewer, Download PDF, Open in New Tab, column-width/format controls via `seatingPlanService.updateTemplateSettings`), "Auto Assignment Failed" conflict diagnostics dialog (Functionary, OASIS ID, School, Eligible, Replace, Details) | matrix-grid + document-preview | working (largest page; 2.3k lines) | any tenant user · `duties` |
| `/undertaking` | `UndertakingForm` | Download platform-rolled-out undertaking form | Title, Academic Year, File Size, Rolled Out date of current undertaking file | Download (`undertakingService.downloadCurrent`); empty state "No undertaking file has been rolled out yet." | detail/download | working (tiny; read + download) | any tenant user · `undertaking` |
| `/candidate-details` | `Candidates` | Candidate master list (Class X/XII) | Stats tabs (All / Class 10th / Class 12th), table: Roll no., Candidate, Class, Parents, Details, Subject codes (row click -> detail); filters: School, Subject, Category, Medium, PwD; per-page; warning panel "Candidates Without Subjects" | Import (PDF via ImportModal), "Re-import & compare" (ReimportCompareModal), "Re-link Subjects" (opens static `/relink-candidate-subjects.html`), Filters, **"Add candidate" -> `/candidates/new`** | list-table | partial - "Add candidate" goes to `/candidates/new` -> redirect `/candidate-details/new`, which `CandidateDetail` treats as an ID (no create mode) -> "Candidate Not Found" | any tenant user · `candidates` (also allowed in billing core_only) |
| `/candidate-details/:id` | `CandidateDetail` | Single candidate profile + subject enrolment | Basic info (name, roll, sex, DOB, category, FLC, concession, PwD), family (father/mother), contact, school, import info, source file link (View original PDF), enrolled subjects table: Subject, Exam date, Answer sheet, Serial no., Room no., Invigilator 1, Invigilator 2 | Assign Subject (modal), Remove Subject (confirm dialog), "Back to Candidate Details", **"Edit candidate" -> `/candidate-details/:id/edit`** | detail | partial - `/:id/edit` route is not defined in App.tsx (falls to 404) | any tenant user · `candidates` |
| `/dispatch-slip` | `DispatchSlip` | Generate dispatch slips for answer-sheet parcels per exam | Table: Sr No, Date, Day, Subject Code, Subject Name, Class, Time, Candidates, Absent (from attendance), Download | Preview dispatch slip PDF (To/From, Centre No, Parcel No, Examination Schedule) in inline overlay with Download / Open in New Tab / Close (`useGenerateDispatchSlipPdfMutation`, `dispatchSlipService.downloadPDF`) | list-table + document-preview | working (note: inline `fixed inset-0` overlay, violates dialog rule) | any tenant user · `dispatch_slip` |
| `/remuneration` | `Remuneration` | Remuneration summary per functionary / duty type | "Duties Summary" (Duty Type, No Of Duties, Remuneration, Conveyance, Refreshment, Total, Grand Total); per-group tables (CS, DCS, Invigilators, ASI CCTV/Frisking, Clerk, Class IV): Sr No, Functionary Name, Oasis ID, No of Duties, (Duty), Remuneration, Conveyance, Refreshment, Total | Jump-to-group scroll, row click -> `/remuneration/:id`; **no export/print** | list-table / report | working (`dutiesService.getDutySelections`, `teacherService.getAll`, `useRemunerationRates`) | any tenant user · `remuneration` |
| `/remuneration/:id` | `RemunerationDetails` | Date-wise remuneration for one functionary | Table: Date, Day, Remuneration, Conveyance, Refreshment, Total | Back | detail | working (`teacherService.getById`, duty selections) | any tenant user · `remuneration` |
| `/form66` | `Form66` | Upload and view CBSE Form 66 (candidate attendance list) | Form 66 Files + Records, expandable tree: Exam Date -> Subjects (Subject Code, Subject Name, Candidates) -> candidate rows (Sr, Roll No, Class); Class X/XII, processing status | Upload Form 66 (TXT upload; PDF/TXT preview tabs), Convert to PDF format, Download Original, Download Form 66 PDF (per date, `useForm66DatePdfMutation`), Expand/Collapse All, Refresh, PDF viewer dialog | list-table (expandable) + document-preview | working | any tenant user · `form66` |
| `/seatingplan` | `SeatingPlan` | Generate seating-plan PDFs from centre datesheet | Mode toggle "Seating plan mode" (Same across all days / Different each day). Tabs: Main Gate, Invigilator Slip (room folder), Room Door Slip, CBSE Format. Per-tab table: Sr No, Date, Day, Subject Code, Subject Name, Class, Time, Candidates, No Of Rooms, Download; layout/template preview (Row 1-3, Roll No / QP Code / Sheet No) | Per-exam Download/Preview PDF (`useGenerateSeatingPlanPDFMutation`), Open in New Tab, auto-saved template layout settings (`useUpdateSeatingPlanTemplateSettingsMutation`), save mode (`seatingPlanService.updateSeatingPlanMode`); warns if rooms not allocated | matrix-grid + document-preview | working | any tenant user · `seatingplan` |
| `/subjects` | `Subjects` | CBSE subject master | Stats tabs (Total / Class 10th / Class 12th), sortable table: Sub Code, Subject Name, Class, Duration (Hours), Answer Sheet (20 pages / 32 pages / 40 graph), Actions | Add Subject modal, Edit Subject modal (`useCreateSubjectMutation`, `useUpdateSubjectMutation`), Import (PDF via dropzone, `useImportSubjectsMutation`), pagination (10/20/50/100/All) | list-table | working (2 inline `fixed inset-0` modals) | any tenant user · `subjects` (also allowed in core_only) |
| `/datesheets` | `DateSheets` | CBSE datesheet import + centre datesheet | Tabs: Full Datesheet, Centre Datesheet, Class 10th, Class 12th. Centre table: Sr No, Date, Day, Class, Subject, Code, Duration, Answer Sheet, Candidates, Rooms, Invigilators | Import CBSE datesheet PDF (ImportModal with error sample/debug), Create/Edit datesheet (CreateModal), Schedule modal, search, **Download Centre Datesheet PDF (client-side jsPDF landscape A4)** + PDF preview dialog | list-table + document-preview | working | any tenant user · `datesheets` (also allowed in core_only) |
| `/examrooms` | `RoomAllocation` | Define exam rooms and rooms-required per exam date | "Examination Rooms" table: Sr No, Room No, Room Name, Class / Section, Floor (Ground..Third), Actions; "Exam Dates" table: Sr No, Room No, Name, Rooms Required; Auto/Manual allocation mode; Shared/different mode | Add/Edit/Delete room (`seatingPlanService.createRoom/updateRoom/deleteRoom`), **Refresh from ASETS** (`syncExamRoomsFromAsets`, `getAsetsExamRoomCandidates` - cross-module link to ASETS locations), Save Exam Rooms, mode toggle | list-table + settings | working | any tenant user · `examrooms` |
| `/answersheets` | `AnswerSheets` | Answer-sheet inventory (received/used/balance/discarded) | Tabs: Received (Sr No, Answer Sheet, Pages, Colour, Class, Serial No From/To, Total, Actions), Used (Sr No, Date, Class, Subject Code/Name, Answer Sheet Type, Candidates, Main Used, Supp. Used, Absent), Balance, Discarded (Serial No, Date, Subject, Code, Room No, Answer Sheet, Class, Received, Used, Balance, Discarded) | Add Quantity / Add Received Answer Sheets modal (colours White/Yellow/Pink/Blue/Red, Graph, Drawing, For Blind), Upload Excel modal (`useUploadExcelMutation`; template download is commented out), Link Answer Sheets to Exam modal, Use/Discard/Remove (`useUseSheetsMutation`, `useDiscardSheetsMutation`, `answerSheetService.deleteAnswerSheet`), series update, PDF preview/download, row -> `/answersheets/:id` | list-table (tabbed) | working (4 inline `fixed inset-0` modals) | any tenant user · `answersheets` |
| `/answersheets/:id` | `AnswerSheetDetails` | One answer-sheet batch: serial allocation & usage | Allocation Schedule (Date & Subject, Students, Serial Range, Total, Download), Discarded sheets (Room No, Roll Number, Sheet No, Action), Supplementary Usage (Date & Subject, Room No, Roll No, Serial No, Used), utilization, guidelines/pro-tip | Set Serial Numbers / Edit Range (`updateAnswerSheet`), Add Discarded (reasons: Torn, Water Damage, Printing Defect, Missing Pages, Damaged/Misprinted, Received Damaged, Other; single or range), remove discarded, save/remove supplementary usage, Download PDF per allocation | detail + matrix-grid | working (2 inline overlays) | any tenant user · `answersheets` |
| `/attendance` | `Attendance` | Mark candidate absentees per exam & upload attendance sheet | Tabs Class X / Class XII; grid: Roll No., Name x one column per exam date+subject (Present/Absent toggles) with present counts per column | Upload attendance sheet (image/PDF, `useUploadAttendanceMutation`), Save (`useSaveAbsenteesMutation`), Absentee List PDF preview + Download/Open in New Tab (`useAbsenteeReportMutation`) | matrix-grid | working | any tenant user · `attendance` |
| `/pwd-info` | `PwdInfo` -> `CentreRecordsUtilityPage` | PwD candidates, scribe, extra time | Static copy: overview bullets, 4 workflow cards (Accommodation Register, Scribe Assignment, Extra Time Planning, Readiness Checklist), 3 "expected outputs" | none | placeholder | placeholder (static roadmap content; no API) | any tenant user · `pwd_info` |
| `/umcs` | `Umcs` -> `CentreRecordsUtilityPage` | Unfair means cases + forwarding performa | Static copy: overview, 4 workflows (Case Intake, Evidence Checklist, Forwarding Performa Generation, Case Status Monitoring), 3 outputs | none | placeholder | placeholder (static; no API) | any tenant user · `umcs` |
| `/stickers` | `Stickers` | Roll-number stickers PDF per exam | Table: Sr No, Date, Day, Subject Code, Subject Name, Class, Time, Candidates, No Of Rooms, Download (from centre datesheet entries; `?` search params supported) | Preview / Download roll-no stickers PDF (`useGenerateSeatingPlanPDFMutation`), Open in New Tab, Retry; inline overlay | list-table + document-preview | working | any tenant user · `stickers` |
| `/performas` | `Performas` (same component as `/exmcl/performas`, labelled ExmclFormats) | Tile hub of printable formats | 8 tiles: Award List, Admit Card, Datesheet, Seating Plan, Duties, Rechecking, Report Card, Consolidated Sheet | Tile click navigates (**all hrefs point to `/exmcl/...`**: performas/award-list, admit-card, report-card, datesheets, seatingplan, duties). Rechecking and Consolidated Sheet have **no href** (dead tiles) | board/dashboard (tile hub) | partial (CNTR route lands users in EXMCL routes; 2 dead tiles) | any tenant user · `performas` |
| `/centre-guidelines` | `CentreGuidelines` | Upload & browse CBSE centre-guidelines PDF | Chapters index and Appendices index (expand/collapse, per-section full content/PDF), total pages, search results, "No Guidelines Uploaded" empty state | Upload Guidelines PDF (modal, `useUploadCentreGuidelinesMutation`), Search guidelines (`useSearchCentreGuidelinesMutation`), view section PDFs (`useGuidelinesViewerMutation`), Download PDF | document-preview (indexed) | working (inline overlay) | any tenant user · `centre_guidelines` |
| `/cbse-circulars` | `CBSECirculars` | Own list of CBSE circulars | Cards sorted by publish date: title, circular number, date, summary, source URL | Add CBSE Circular modal (Title*, Circular Number, date, Source URL, Summary), Open Circular link, Delete (`cbseCircularService.getAll/create/deleteById`) | list (cards) + form | working (inline overlay) | any tenant user · `cbse_circulars` |
| `/cbse-portals` | `CBSEPortals` | Quick links to official CBSE portals | 6 hardcoded cards: CBSE Main Website, CBSE Academics, Pariksha Sangam, CBSE Results, OECMS, LOC / Admit Card | External link click per card | board/dashboard (link tiles) | working (static links by design) | any tenant user · `cbse_portals` |

### CNTR-adjacent routes defined in the CNTR block but belonging to EXMCL (listed for completeness, handled by another part)
`/exmcl/centre-details`, `/exmcl/exam-functionaries(/:id)`, `/exmcl/duties`, `/exmcl/candidate-details(/:id)`, `/exmcl/seatingplan`, `/exmcl/examrooms`, `/exmcl/answersheets(/:id)`, `/exmcl/attendance` re-use the CNTR page components (same `CentreDetails`, `Teachers`, `TeacherDetail`, `Duties`, `Candidates`, `CandidateDetail`, `SeatingPlan`, `RoomAllocation`, `AnswerSheets`, `AnswerSheetDetails`, `Attendance`). Because of this, CNTR pages' internal links (e.g. Candidates row click -> `/candidate-details/:id`) leave the `/exmcl` prefix.

---

## C. Core / shell routes (inside Layout)

| route | page component | purpose | main data shown | primary actions | page type | completeness | role |
|---|---|---|---|---|---|---|---|
| `/dashboard` | `Dashboard` | CNTR day-of-exam operations board | Exam timeline date strip (select day) + widgets for the selected date: Candidate Details (X/XII), PwD Candidates (Roll No, Room No, With/Without Scribe, Sheet No, Extra Time, 60 Minutes, Next Date), Duties Summary, Answer Sheet Detail, Packing Details, Status Tracker (Step, Status e.g. Seating Plan Download), School Wise Distribution (School, X, XII, Total), Upcoming Exam Details (Date, Day, Subject, Code, Class, Candidates, Rooms Req., Hindi Medium, PwD, Scribe), Seating & Invigilator Details (Room No, Candidates, School, Invigilator 1/2); "No exams scheduled" empty state; floating attendance-job progress widget | Date selection only (read-only board); auto-redirects to `/onboarding` if onboarding status has no session | board/dashboard | working (`useTodaysExams`, `useCentreDatesheetEntries`, `useDailyDuties`, `useDailyAnswerSheetSummary`, `useOnboardingStatus`, `useJobStatus`) | any tenant user · `dashboard` (core; allowed in core_only) |
| `/school-hub` | `SchoolHub` | Module tile launcher | 8 hardcoded tiles: Self Examination, Time Table, Finance, Transport, Staff, Academics, Activities, Cntr | Tile click navigate. **Dead links:** `/self-examination`, `/finance`, `/transport`, `/academics` are not defined routes (-> 404); Time Table -> `/time-table/classes`, Staff -> `/staff`, Activities -> `/activities`, Cntr -> `/dashboard` work | board/dashboard (tile hub) | partial (4 of 8 tiles broken; hidden unless `school_hub` toggle explicitly true) | any tenant user · `school_hub` (opt-in) |
| `/staff` | `Staff` | Read-only staff directory (derived from exam functionaries) | Table: Sr No, Name, Employee ID, Designation, Department, Phone, Email, School; filtered to the centre's school (by code or name from `/centre-details`) | Search box only | list-table | working (`teacherService.getAll` paged + `api.get('/centre-details')`); not the STAAF module | any tenant user · gated by `exam_functionaries` prefix |
| `/activities` | `Activities` | Manage school Houses and Clubs | Two tables: Houses (Sr No, House Name, Actions), Clubs (Sr No, Club Name, Actions) | Add (Enter or button), Delete, duplicate check via `window.alert` | list-table | placeholder (React `useState` only - nothing persisted or fetched; real ACTVT module lives under `/actvt/*`) | any tenant user · no feature key (ungated) |
| `/billing` | `Billing` | Tenant subscription status + billing profile | Entitlement cards (Access Mode, State, Plan, Trial Ends, Grace Ends), Billing Profile form (Billing Email, Legal Name, GSTIN, Place of Supply, HSN/SAC default), Recent Invoices table: Invoice, Status, Amount, Due | Pay Now (`billingService.payNow`, opens payment link), Save billing profile (`updateProfile`) | settings + list-table | working (`billingService.getMe`, `getInvoices`); this is the redirect target when `core_only` | any tenant user · `billing` (core) |
| `/account-settings` | `AccountSettings` | School profile / branding | School Profile form: School Name, School Code, CBSE Affiliation No, Affiliation till, Tagline, Address, Contact No, Email, logo preview; Account section shows login email (read-only) | Upload Logo (`schoolProfileService.uploadLogo`), Save profile (`updateProfile`) | settings | working (no password change / user mgmt here) | any tenant user · `account_settings` (core) |
| `/help-support` | `HelpSupport` | Help centre | Search hero, "Browse by School OS Modules" grid (`HELP_MODULE_CATALOG`, enabled vs coming-soon per feature toggles), module detail, FAQ accordion (show all), Getting Started, System Status (`useSystemStatusQuery`), contact panel (mailto support@capabble.cloud) | Report an issue modal (`SupportForm` -> `supportService.submitTicket`), Share feedback modal (`FeedbackForm` -> `submitFeedback`), module drill-in/back | document/board (help centre) | working | any tenant user · `help_support` (core) |
| `/dropdown-examples` | `DropdownExamples` | Internal component gallery for `Dropdown` variants | ~10 demo sections (basic, searchable, multi etc.) with static sample options | Interactive demos only | placeholder (dev showcase) | working as demo; no business data; **reachable by any logged-in user, not feature-gated** | any tenant user · ungated |
| `/dialog-showcase` | `DialogShowcase` | Internal gallery for `Dialog` component | Header "Dialog Component Showcase" + `AllDialogExamples` | Open demo dialogs | placeholder (dev showcase) | working as demo; **not feature-gated** | any tenant user · ungated |

---

## D. Redirects (`<Navigate>`) in App.tsx

| from | to | notes |
|---|---|---|
| `/` (authed, has session) | `/dashboard` | public route logic |
| `/` , `/login`, `/forgot-password`, `/signup`, `/signupold`, `/signup/complete` (authed) | `/dashboard` if session else `/select-session` | |
| `/select-session` (unauth) | `/` | |
| `/select-session` (has session) | `/dashboard` | |
| `/onboarding`, `/onboarding/validation` (unauth) | `/` | |
| `/onboarding`, `/onboarding/validation` (no session) | `/select-session` | |
| any protected route (unauth) | `/` | `ProtectedRoute` |
| any protected route (no session) | `/select-session` | `ProtectedRoute` |
| non-core path when billing `accessMode=core_only` | `/billing?reason=core-only` | `ProtectedRoute` |
| feature-disabled path | first enabled path from catalog (else "Page disabled by admin" screen) | `ProtectedRoute` |
| `/teachers` | `/exam-functionaries` | legacy |
| `/teachers/:id` | `/exam-functionaries/:id` | legacy - **bug: literal `:id` string in `to`, param is not interpolated**, so lands on `/exam-functionaries/:id` and "Teacher not found" |
| `/candidates/*` | `/candidate-details/*` (path prefix swapped, search + hash preserved) | legacy, via `LegacyCandidatesRedirect` |
| `/rooms` | `/examrooms` | legacy |
| `/exmcl/candidates/*` | `/exmcl/candidate-details` | drops subpath/ID |
| `/exmcl/rooms` | `/exmcl/examrooms` | |
| `/exmcl` | `/exmcl/centre-details` | |
| `/time-table` | `/time-table/classes` | |
| `/time-table/distribution`, `/time-table/period-allocation` | `/time-table/period-distribution` | |
| `/stdnt` | `/stdnt/stdntboard` | |
| `/stdnt/student-info` | `/stdnt/stdntboard` | |
| `/staaf` | `/staaf/overview` | |
| `/attnd` | `/attnd/attndboard` | |
| `/almni` | `/stdnt/alumni` | |
| `/acdmc` | `/acdmc/lesson-plan` | |
| `/actvt` | `/actvt/houses` | |
| `/mdcl` | `/mdcl/cases` | |
| `/asets` | `/asets/dashboard` | |
| `/cpitl` | `/cpitl/dashboard` | |
| (non-redirect alias) `/actvt/calendar` | renders `ActvtBoard` (same as `/actvt/board`) | |

---

## E. Findings worth flagging (scope of this part)

1. **No role-based route protection** - Admin vs Data Entry Operator cannot be distinguished by any CNTR/core route; only feature toggles and billing mode gate access. (Server may enforce roles; not checked here.)
2. **Broken navigation targets:** Candidates "Add candidate" (`/candidates/new` -> no create mode); CandidateDetail "Edit candidate" (`/candidate-details/:id/edit` undefined route); `/teachers/:id` redirect literal `:id`; SchoolHub tiles to undefined `/self-examination`, `/finance`, `/transport`, `/academics`; Performas tiles Rechecking and Consolidated Sheet have no target.
3. **Placeholder CNTR pages:** `/pwd-info`, `/umcs` (static `CentreRecordsUtilityPage`), `/pricing` (dead buttons), `/activities` (non-persisted local state).
4. **Dead/disabled UI:** Teachers Export button + ExportModal hard-disabled (`{false && ...}`); exam-functionaries bulk delete is UI-only (`uiOnlyDelete`, hides rows locally, stored under `capabble:exam-functionaries:hidden-teacher-ids`); AnswerSheets Excel template download commented out.
5. **Dialog-rule violations (CLAUDE.md / cursor rule):** inline `fixed inset-0` overlays (not portal'd, header may paint over) in DispatchSlip, AnswerSheets (x4), AnswerSheetDetails (x2), Subjects (x2), Duties, Form66, SeatingPlan, DateSheets, Stickers, CBSECirculars, CentreGuidelines, Attendance.
6. **Cross-module coupling inside CNTR:** `/examrooms` pulls rooms from ASETS locations; `/performas` links into `/exmcl/*`; `/exmcl/*` routes reuse CNTR pages wholesale.
7. **Ungated dev pages:** `/dropdown-examples`, `/dialog-showcase`, `/activities` have no feature key and are reachable in production by any authenticated user.
8. Onboarding routes sit outside `ProtectedRoute`/`Layout` (no feature/billing gating, no sidebar).

<!-- 03_routes_tmtbl_stdnt_staaf_acdmc -->
## Client route audit: TMTBL, STDNT, STAAF, ACDMC

Source: `client/src/App.tsx` (lines ~330-382), pages under `client/src/pages/`. All routes sit under `<Route path="/" element={<ProtectedRoute/>}>` then `<Layout/>` (wrapped in `TimetableProvider` when `featureToggles.timetable_classes !== false`).

## Role / access model (applies to every row below)
- `ProtectedRoute` checks only: authenticated -> academic session selected (`/select-session`) -> billing `accessMode === 'core_only'` blocks non-core paths (only `/dashboard`, `/candidate-details`, `/subjects`, `/datesheets`, `/billing` allowed) -> tenant feature toggle via `constants/featureAccess.ts` + `tenantFeatureCatalog.json`.
- There is NO per-role (Admin vs Data Entry Operator) gate on any route in this scope. Role column therefore says "any authenticated tenant user + feature toggle" and names the toggle key.
- Feature toggle keys: `timetable_classes` (/time-table/classes), `timetable_subjects`, `timetable_bell_timings`, `timetable_class_wise`, `timetable_teacher_wise`, `timetable_formats`, `timetable_period_allocation` (covers period-distribution, distribution, period-allocation, subject-allocation, departments); `stdnt_classes`, `stdnt_subjects`, `stdnt_student_info` (stdntboard, student-info), `stdnt_students` (/stdnt/students and children incl. profile), `almni_directory` (/stdnt/alumni, /almni); `staaf_staff_members` (prefix `/staaf`, one toggle for all STAAF pages); `acdmc_academics` (prefix `/acdmc`, one toggle for all ACDMC pages).
- No toggle key exists for `/time-table/teachers`, `/time-table/generate`, `/time-table/substitution`, `/time-table/versions` (not matched by any prefix -> always allowed, though `/time-table/teachers` is hidden in nothing and gated only by login). Disabled toggle -> redirect to first enabled path or "Page disabled by admin" screen.

## TMTBL (Timetable)
State is held in `contexts/TimetableContext.tsx` (952 lines): hydrates from `timetableService.getState()`, debounce-autosaves via `timetableService.saveState()` (teachers, subjects, classes, teacherSubjectAllocations, parallelSubjectPairs, commonPeriods, periodsPerWeek, periodAllocation, timetableGrid, matrix selections). Versions/generation/exports use `timetableService`; bell timings use `bellTimingsService`.

| route | page component | purpose | main data shown | primary actions | page type | completeness | role |
|---|---|---|---|---|---|---|---|
| `/time-table` | `<Navigate>` -> `/time-table/classes` | Redirect to default timetable page | - | redirect | redirect | working | login + session |
| `/time-table/teachers` | `TimetableTeachers` (wraps shared `pages/Teachers` with `sourceTeachers`) | Timetable-local teacher list synced from staff records of type "Teacher" | Teacher: name, short name (subjectCode), subjects. Stats, duty type, school columns hidden | Delete selected (local only, also drops that teacher's subject allocations); row edit and API mutations disabled. On mount it pulls all `dutyType=Teacher` records from `teacherService` (paged) and overwrites context teachers | list-table | working (read-through sync + local delete; no add/edit) | login + session (no toggle key) |
| `/time-table/classes` | `TimetableClasses` (1774 lines) | Define classes/sections for the timetable | "Class Section Matrix" (classes x sections checkbox matrix) and class table: class, section, floor, incharge, class group, display order, subjects | Add Class, Add Section, Save matrix, inline add/edit rows, Delete selected | matrix-grid + list-table | working (context + autosave to timetable state API) | `timetable_classes` toggle |
| `/time-table/subjects` | `TimetableSubjects` (1956 lines) | Manage timetable subjects, teacher-subject matrix, parallel subject pairs, common periods | Subject: name, type, requires consecutive periods + count, colour; teacher x subject allocation matrix; parallel pairs; common-period config | Add Subject, inline edit, Delete selected, Save subject matrix, add/edit/delete parallel pair, common period setup | matrix-grid + list-table | working | `timetable_subjects` toggle |
| `/time-table/departments` | `Departments` (499 lines) | Build subject departments from a teacher-subject matrix and assign teachers per class | Teacher Subject Matrix (teachers x subjects checkboxes), department cards per subject with class/section rows and teacher toggles | Toggle matrix cells, toggle teacher per class-section (writes to context allocations) | matrix-grid | working (context-backed, autosaved; no own buttons/export) | `timetable_period_allocation` toggle (departments prefix) |
| `/time-table/period-distribution` (aliases `/time-table/distribution`, `/time-table/period-allocation` redirect here) | `PeriodAllocation` (669 lines) | Set periods per week per class-subject | Table: Sr, Class, Section, one column per subject (parallel subjects flagged), Total vs periodsPerWeek | Edit numeric counts per cell, summary/validation of totals | matrix-grid | working (context state, autosaved) | `timetable_period_allocation` toggle |
| `/time-table/bell-timings` | `BellTimings` (933 lines) | Configure school bell schedule (periods and breaks) with versioning | Period/break rows (name, start, end, duration), session/meta, saved versions | Add Period, Add Break, Save Bell Timings, Download PDF (jsPDF generated client-side, in-page preview dialog with page count and "Open in new tab"), Save/Apply/Delete version | form/wizard (editable schedule) + document-preview | working (`bellTimingsService` real API, PDF generation) | `timetable_bell_timings` toggle |
| `/time-table/generate` | `Generate` (837 lines) | Pre-flight check then auto-generate timetable versions; publish/archive/delete versions | Config check (class, subject, teacher counts, total period slots, errors/warnings), version list: name, status (draft/published/archived), fill-rate bar, conflict report, generate result | Refresh check, Generate (named version), View (navigates to class-wise), Publish, Archive, Delete, Export Excel (per version) | board/dashboard + list-table | working (`timetableService.generate/getVersions/publishVersion/archiveVersion/deleteVersion/exportExcel`) | login + session (no toggle key) |
| `/time-table/class-wise` | `ClassWise` (1990 lines) | View/edit a class's weekly timetable grid, manual or auto fill, per version | Day x period grid for selected class; cells = subject + teacher; teacher-clash warnings; version selector; bell timings loaded for slot labels | Manual/Auto mode switch, cell edit dialog (alerts if teacher already assigned elsewhere), Auto-fill class timetable, Export PDF (server `exportClassPDF`), Export Excel (server `exportExcel`) | matrix-grid + document-preview/export | working | `timetable_class_wise` toggle |
| `/time-table/teacher-wise` | `TeacherWise` (944 lines) | View each teacher's weekly schedule across classes, per version | Per teacher: day x period grid with class-section and subject; search; empty states | Version select, Export PDF per teacher (`exportTeacherPDF`) | matrix-grid (read-only) + export | working (read-only, derived from version) | `timetable_teacher_wise` toggle |
| `/time-table/substitution` | `Substitution` (169 lines) | Mark which periods (I-VIII) each teacher is available/substituting | Table: Sr No, Teacher name (+ short name), 8 period checkboxes | Toggle checkboxes only | matrix-grid | partial (checkbox state in local `useState` only; not persisted, no API, no substitute-name input despite caption, no export; teachers/subjects from context) | login + session (no toggle key) |
| `/time-table/versions` | `Versions` (5 lines) | Legacy route | - | `<Navigate>` to `/time-table/generate` | redirect | working (redirect only; note component file exists but route has no direct page) | login + session |
| `/time-table/formats` | `Formats` (161 lines) | Download a saved version in a chosen format | Version dropdown (via `getVersions`), format cards: Excel (.xlsx), class-wise PDF, teacher-wise PDF | Download Timetable (`exportExcel`/`exportClassPDF`/`exportTeacherPDF` for whole version) | form/wizard (export picker) | working | `timetable_formats` toggle |

Unrouted TMTBL files: `TimetablePagePlaceholder.tsx` (46 lines; generic eyebrow/title/description/3-card placeholder component; not imported by any page) and `SubjectAllocation.tsx` (455 lines; not imported in App.tsx; `/time-table/subject-allocation` is in the feature prefix list but has no route, so it would 404/fall to default). `TmtblLanding` is the public landing for the tmtbl brand variant (outside scope).

## STDNT (Students)
Redux `studentSlice` (`fetchStudents`, `fetchStudentStats`, `createStudent`, `updateStudent`, `bulkDeleteStudents`), `studentService` (template download/upload), `timetableService.getState()` for class/section options, ACTVT houses service (`makeRecordService`) for house selection.

| route | page component | purpose | main data shown | primary actions | page type | completeness | role |
|---|---|---|---|---|---|---|---|
| `/stdnt` | `<Navigate>` -> `/stdnt/stdntboard` | Redirect | - | - | redirect | working | `/stdnt` itself has no toggle prefix; target gated by `stdnt_student_info` |
| `/stdnt/stdntboard` (`/stdnt/student-info` redirects here) | `StudentInfo` (341 lines) | Student analytics board | KPI cards (Total, Active, Classes, Sections), class-section groups with counts, gender counts, class x age matrix (`stats.ageMatrix`) | none (read-only, loads `fetchStudentStats` on mount) | board/dashboard | working (real stats API) | `stdnt_student_info` toggle |
| `/stdnt/students` | `Students` (2186 lines) | Student master list with add/edit/import | Table columns: Adm No., Roll, Photo, Name, Class, Sec, Father, Mother, DOB, Gender, House (colour-coded), Bus, Blood, Cat(egory), Mobile, PEN, Address; filters by class/section/search; sortable | Add Student (inline form: photo upload with drag-drop, class/section, house, bus, blood group, guardian, address, etc.), edit (modal, also opened via router state `editStudent`), per-row change section, Delete selected (bulk, batched), Download import Template (xlsx), Upload filled template (existing Admission Nos skipped), Clear Filters, refresh, row click -> `/stdnt/students/:id`. No export | list-table + form | working | `stdnt_students` toggle |
| `/stdnt/students/:id` | `StudentProfile` (381 lines) | Single student 360 profile | Header card (photo, name, class/section, admission no.), personal details (DOB, gender, blood group, category, nationality, religion, PEN), family (father, mother, guardian phone), address, attendance (`attndService.getStudentAttendance`), subjects enrolled, house and transport (house, bus/route), recent activities, awards and achievements, certificates count | Back to list, Edit Profile (navigates to list with `editStudent` state), "Download Profile" button | detail | partial (real API data for student + attendance + activities; "Download Profile" button has no onClick handler = dead) | `stdnt_students` toggle (prefix match) |
| `/stdnt/classes` | `TimetableClasses` (reused, same component as `/time-table/classes`) | Manage classes/sections from the Students module | Same as TMTBL Classes (class section matrix, floor, incharge, subjects) | Same (Add Class/Section, Save, Delete) | matrix-grid + list-table | working (shared timetable state; STDNT and TMTBL edit the same data, which cuts against module-independence) | `stdnt_classes` toggle |
| `/stdnt/subjects` | `TimetableSubjects` with `showParallelSubjectPairs={false} showCommonPeriod={false}` | Subject master for Students module | Subject table + teacher-subject matrix only | Add Subject, edit, delete, Save matrix | matrix-grid + list-table | working (shared timetable state) | `stdnt_subjects` toggle |
| `/stdnt/alumni` (`/almni` redirects here) | `AlmniDirectory` (249 lines) | Alumni directory (Class XII pass-outs) | Alumni cards: name, photo, batch session, passed-out class, section, roll/admission no., phone, email, city, higher education, occupation; filters batch and section; total count; current session; auto-sync toast ("Class XII students added to alumni") | Search (name), filter by batch/section | list-table (card grid) | working (`almniService.getAlumni`, server auto-syncs; no add/edit/export UI, `syncAlumni` exists in service but not wired) | `almni_directory` toggle (module = stdnt) |

Unrouted: `pages/StudentDetail.tsx` (566 lines) is NOT imported or routed anywhere; it is a legacy detail page (back button navigates to `/students`, a path that does not exist). Dead code. `StdntLanding` (376 lines) is the public marketing page for the stdnt brand (rendered by `PublicLanding` at `/` when unauthenticated; outside route scope). `components/students/StudentModal.tsx` exists but `Students.tsx` uses its own inline form.

## STAAF (Staff)
Most STAAF pages wrap the shared `pages/Teachers` list (exam-functionary component) with props; they hit `/api/teachers` via `useTeachers`/`teacherService`. Delete is `uiOnlyDelete` (hidden in UI per session, not removed on server).

| route | page component | purpose | main data shown | primary actions | page type | completeness | role |
|---|---|---|---|---|---|---|---|
| `/staaf` | `<Navigate>` -> `/staaf/overview` | Redirect | - | - | redirect | working | `staaf_staff_members` toggle (prefix `/staaf`) |
| `/staaf/overview` | `StaafOverview` (169 lines) | Staff analytics | Stat cards (Total, Active, Teaching, Support), Gender Matrix (Male/Female/Other/Unspecified), Designation Matrix (PRT/TGT/PGT/Other), Group Matrix (Teaching, Sports Coach, Admin, Class IV, Drivers, Conductors, Security) computed client-side from `useTeachers` (limit 500) | none (read-only) | board/dashboard | working (real data; capped at 500 records) | `staaf_staff_members` toggle |
| `/staaf/organisation-structure` | `StaafOrgStructure` (168 lines) | Org chart by band | Centre name (`useCentreDetails`) plus bands: Principal, Vice-Principal, PGT, TGT, PRT, Sports Coach, Admin, Class IV, Drivers, Conductors, Security, Other with member cards | none (read-only) | board/dashboard (org chart) | working (derives bands from designation/dutyType via `getOrgBandId`) | `staaf_staff_members` toggle |
| `/staaf/teaching-staff` | `StaafStaffGroup group="teaching"` | Teaching staff list | Teachers table (name, employee/OASIS id, designation, type, subjects, etc. from shared `Teachers`) filtered with `isTeachingStaff` | Add/edit modal, bulk delete (UI-only), CSV/XLSX template download and upload, export modal (button hidden in code), search/filter | list-table | working | `staaf_staff_members` toggle |
| `/staaf/sports-coach` | `StaafStaffGroup group="sportsCoach"` | Sports coaches/PET list | Same columns, filter `isSportsCoach` | Same as above | list-table | working | same |
| `/staaf/admin-staff` | `StaafStaffGroup group="admin"` | Admin/clerk staff list | Same columns, filter `isAdminStaff` | Same | list-table | working | same |
| `/staaf/drivers` | `StaafStaffGroup group="drivers"` | Drivers list | Same columns, filter `isDriver` | Same | list-table | working | same |
| `/staaf/conductors` | `StaafStaffGroup group="conductors"` | Conductors list | Same columns, filter `isConductor` | Same | list-table | working | same |
| `/staaf/security` | `StaafStaffGroup group="security"` | Security staff list | Same columns, filter `isSecurityStaff` | Same | list-table | working | same |
| `/staaf/staff-members` | `StaafStaffMembers` (21 lines) | All staff list | Same columns, all records (`includeAllRecords`), type options Teacher/Sports Coach/Admin/Class IV/Driver/Conductor/Security/Peon/Sweaper/Clerk | Same | list-table | working | same |
| `/staaf/recruitment` | `StaafRecruitment` (365 lines) | Recruitment pipeline tracker | Process-flow strip; tabs: Vacant posts (post, group, vacancies, Open/On hold/Filled), Advertisement (title, published, last date, medium), Job application form + applications (name, post, phone, email, status Received/Shortlisted/Rejected), Interview / Demo / Entrance test schedules (candidate, post, date, time, venue); stat tiles | Switch tabs, submit application form (adds row) | board/dashboard + list-table + form | partial/mock (state is `SAMPLE` seed data persisted to `localStorage` key `staaf:recruitment`; no API, no server persistence; only the application form adds rows) | `staaf_staff_members` toggle |

Notes: `StaafStaffGroup` has no "Class IV" route although Overview/OrgStructure show a Class IV group (only reachable via `/staaf/staff-members`). `/staff` (legacy `Staff`) and other `<Teachers>` routes live outside this scope.

## ACDMC (Academics)
All five pages are thin wrappers around `components/records/RecordManager` + `services/recordService.makeRecordService(basePath)` (generic CRUD: `GET/POST/PUT/DELETE basePath`). Each shows an add/edit form on one side and a card list of saved records (title + meta, Edit/Remove links) on the other. No export, no PDF, no import.

| route | page component | purpose | main data shown | primary actions | page type | completeness | role |
|---|---|---|---|---|---|---|---|
| `/acdmc` | `<Navigate>` -> `/acdmc/lesson-plan` | Redirect | - | - | redirect | working | `acdmc_academics` toggle (prefix `/acdmc`) |
| `/acdmc/lesson-plan` | `AcdmcLessonPlan` | Lesson plans | `/acdmc/lesson-plans`: title, teacher, class, section, subject, date, topic, objectives, classroom activities, resources, status (draft/published) | Create / Edit / Remove | form/wizard + list (card list) | working (real CRUD API via record service; basic, no filters/search) | `acdmc_academics` toggle |
| `/acdmc/homework` | `AcdmcHomework` | Homework | `/acdmc/homework`: title, teacher, class, section, subject, assigned date, due date, details, status | Create / Edit / Remove | form + list | working (basic CRUD) | same |
| `/acdmc/assignment` | `AcdmcAssignment` | Assignments | `/acdmc/assignments`: title, teacher, class, section, subject, assigned on, due date, max marks, instructions, status | Create / Edit / Remove | form + list | working (basic CRUD; no submissions/grading) | same |
| `/acdmc/quiz` | `AcdmcQuiz` | Quizzes | `/acdmc/quizzes`: title, teacher, class, section, subject, topic, date, duration (min), questions (free text "question | A | B | C | D | answer"), status | Create / Edit / Remove | form + list | working (basic CRUD; questions are a plain textarea, no quiz-taking/results) | same |
| `/acdmc/curriculum` | `AcdmcCurriculum` | Book/curriculum list per class | `/acdmc/curriculum`: class, subject, book title, author, publisher, session type (current/next), academic session, status (proposed/selected) | Create / Edit / Remove | form + list | working (basic CRUD) | same |

Teacher/class/section/subject fields in ACDMC are free-text inputs (not linked to Teachers/Classes/Subjects masters), so there is no cross-module integration yet.

## Cross-cutting findings
- No role gating anywhere in these routes; access is solely session + billing mode + per-tenant feature toggle.
- Dead/unrouted: `StudentDetail.tsx`, `SubjectAllocation.tsx`, `TimetablePagePlaceholder.tsx`, `Versions.tsx` is only a redirect shim.
- Partial/mock: `Substitution` (local-only state), `StaafRecruitment` (localStorage sample data), `StudentProfile` "Download Profile" button (no handler).
- Module coupling: `/stdnt/classes` and `/stdnt/subjects` reuse the TMTBL components and shared TimetableContext state; `/time-table/teachers` reads from staff (`teacherService`); `Students.tsx` pulls class/section options from `timetableService.getState()` and houses from the ACTVT record service.
- `/time-table/teachers`, `/time-table/generate`, `/time-table/substitution` have no feature-toggle key, so a platform admin cannot disable them individually.

<!-- 04_routes_exmcl_attnd -->
## Part 04: EXMCL and ATTND routes (client audit, read-only)

Source: `client/src/App.tsx` (routes at lines ~368-371 for attnd and ~454-486 for exmcl), pages under `client/src/pages`, components under `client/src/components/{exmcl,attnd,format-editor}`.

Role note (applies to every row below): all routes sit inside `<Route path="/" element={<ProtectedRoute />}>`. There is NO per-route role check anywhere in the router. Gating is: authenticated + academic session selected + billing `accessMode` + per-tenant feature toggle matched by path prefix (`constants/tenantFeatureCatalog.json`, keys `exmcl_*`, `attnd_staff_attendance`, `attnd_student_attendance`). Tenant roles are Admin and Data Entry Operator; both reach these pages if the feature toggle is on. Role column below therefore reads "any authed tenant user (feature-toggle gated)" and is abbreviated to "any authed".

Page-type vocabulary: board/dashboard, list-table, detail, form/wizard, matrix-grid, document-preview, settings, auth, placeholder.

---

## EXMCL (Internal Exams)

### Route table

| route | page component | purpose | main data shown | primary actions | page type | completeness | role |
|---|---|---|---|---|---|---|---|
| `/exmcl` | `<Navigate>` | Redirect to `/exmcl/centre-details` | none | redirect | n/a | working | any authed |
| `/exmcl/centre-details` | `CentreDetails` (shared with CNTR, unchanged) | Edit exam-centre profile and see school-wise candidate summary | Centre no, name, school code, superintendent + contact, deputy superintendent + contact; summary table per school: Sr No, school code/name, Class X roll from-to + count, Class XII roll from-to + count, total (derived from CNTR `candidates`) | Save/update centre information | form/wizard + list-table (summary) | working (hooks `useCentreDetails`, `useCentreDetailsSummary`, `useUpdateCentreDetailsMutation`). Semantically CBSE-centre data, not internal-exam data | any authed |
| `/exmcl/exam-functionaries` | `Teachers` (props `hidePagination includeAllRecords uiOnlyDelete`, same as CNTR) | List/manage exam functionaries (invigilators, CS, etc.) | Teacher rows: name, school code, subject, duty type, joining/experience filters | search, filter panel, import template download/upload, export modal, add/edit, UI-only delete | list-table | working (React Query + teacher service). No exmcl-specific behaviour | any authed |
| `/exmcl/exam-functionaries/:id` | `TeacherDetail` (shared) | Single functionary profile | Teacher fields, duty history | edit/back. Back buttons `navigate("/teachers")` which redirects to CNTR `/exam-functionaries`, so the user leaves the `/exmcl/` prefix | detail | working (prefix leak on back nav) | any authed |
| `/exmcl/duties` | `Duties` (shared, unchanged) | Allocate functionaries to rooms per exam day | Tabs per duty type (CS, ASI/Invigilator, ...), functionaries, exam dates, rooms, max-per-day settings, conflicts | select/save duty selections, auto-assign daily duties, allocation mode toggle, duty PDF preview/print, conflict dialog | matrix-grid + document-preview | working. Driven by CNTR centre datesheet and seating-plan template settings, not internal datesheets | any authed |
| `/exmcl/candidate-details` | `Candidates` (shared, unchanged) | List CBSE candidates | Candidate rows (roll no, name, school, class 10th/12th, subjects), stats cards, "without subjects" accordion | PDF/Excel import modal, re-import modal, filters, tabs All/10th/12th, page-size, navigate to detail | list-table | working. Shows CNTR `candidates` collection (CBSE board candidates), not internal `students`. Add button navigates to `/candidates/new` (leaves prefix) | any authed |
| `/exmcl/candidate-details/:id` | `CandidateDetail` (shared) | One candidate record | Candidate fields, photo, subjects | edit, delete. Navigates to `/candidate-details...` (CNTR path) | detail | working (prefix leak) | any authed |
| `/exmcl/candidates/*` | `<Navigate>` | Legacy redirect to `/exmcl/candidate-details` | none | redirect | n/a | working | any authed |
| `/exmcl/cbse-registration` | `ExmclCbseRegistration` (985 lines) | Define per-class subject slots and per-student CBSE registration incl. one additional subject | Class subject matrix (class x section rows, subject slots from timetable subject catalog); student matrix (students x class subjects, checkboxes, additional-subject marker) | Save Class Matrix, Save student matrix, select class/section, search students, toggle column for all, double-click to mark additional subject for all, add/remove subject slots; auto-links 10th to 11th/12th rows | matrix-grid | working (`cbseRegistrationService` GET/PUT `/cbse-registration`, `/cbse-registration/class-subjects`, plus `/students/stats`) | any authed |
| `/exmcl/seatingplan` | `SeatingPlan` (shared, DIFFERS under exmcl) | Seating plan PDF generation | Centre datesheet entries per date/session, rooms | PDF generate + preview dialog (react-pdf), template settings. Under `/exmcl/` (`isExmclRoute = pathname.includes('/exmcl/')`) it additionally loads and shows a "Seating plan mode" card with buttons `same_across_days` vs different rooms per day (`seatingPlanService.getSeatingPlanMode`) | document-preview + settings | working (mode card exmcl-only). Still reads CNTR centre datesheet | any authed |
| `/exmcl/subjects` | `ExmclSubjects` (291 lines) | Map subjects to internal exams | Rows = subjects (merged from timetable subjects + master subjects, source badge timetable/master/both); columns = exams (code); checkbox per cell; per-row and per-column select-all | search, save exam-subject matrix, navigate (link to Exams page if none) | matrix-grid | working (`exmclExamService.getSubjectMatrix/saveSubjectMatrix` PUT `/exam-definitions/subject-matrix`) | any authed |
| `/exmcl/datesheets` | `ExmclDatesheets` (697 lines) | Build and list internal-exam datesheets | Builder: exam, class, section (only for senior secondary), title, per-subject rows (Subject, Date, Start, End, Duration min); saved list: Title, Exam, Class, Section, Subjects, Created | create datesheet (POST then PUT subjects, `examType: 'internal'`), reload, remove row | form/wizard + list-table | working (`datesheetService`, `exmclExamService`, `subjectService`, `/students/stats`). Saved list is view-only (no edit/delete/PDF found) | any authed |
| `/exmcl/examrooms` | `RoomAllocation` (shared, DIFFERS under exmcl) | Choose exam rooms | exmcl: rooms sourced from ASETS Locations (candidate list with Class/Section column, "Use for Exams" checkbox, ASETS Rooms count, total capacity) + embedded `ExamRoomLayoutDesigner`. CNTR: room CRUD plus date-wise room allocation and allocation mode | exmcl: Refresh from ASETS, tick rooms, Save Exam Rooms (`syncExamRoomsFromAsets`), per-room seating layout save/save-all. CNTR: add/delete rooms, allocate by date | list-table + settings (layout designer) | working (ASETS dependency is a cross-module call) | any authed |
| `/exmcl/rooms` | `<Navigate>` | Redirect to `/exmcl/examrooms` | none | redirect | n/a | working | any authed |
| `/exmcl/answersheets` | `AnswerSheets` (shared, unchanged) | Answer-sheet inventory/usage | Answer sheet entries with series, counts, centre datesheet, absentee overlay | add modal, Excel upload, link modal, consolidated preview, use sheets | list-table + document-preview | working. Row click navigates to `/answersheets/:id` (CNTR path, prefix leak) | any authed |
| `/exmcl/answersheets/:id` | `AnswerSheetDetails` (shared) | One answer-sheet record | entry detail, usage | edit/back `navigate(-1)` | detail | working | any authed |
| `/exmcl/attendance` | `Attendance` (shared, unchanged) | Mark exam absentees for CBSE candidates | Tabs Class X / Class XII; columns = one per (exam date, subject code) from centre datesheet; rows = candidates (`useCandidates` class 10th/12th, limit 1000); present/absent counts per column | toggle absent checkbox, save absentees (`useSaveAbsenteesMutation`), upload attendance sheet (`useUploadAttendanceMutation`), absentee report PDF preview/download (`useAbsenteeReportMutation`), search | matrix-grid + document-preview | working. IMPORTANT: this uses `hooks/useAttendance.ts` (CNTR Form-66 style absentees). It is NOT the ATTND module and shows CBSE candidates, not internal students | any authed |
| `/exmcl/performas` | `Performas` -> `ExmclFormats` (DIFFERS under exmcl: `pathname.includes('/exmcl/performas')` returns hub) | Hub of format tiles | 8 tiles: Award List, Admit Card, Datesheet, Seating Plan, Duties, Rechecking, Report Card, Consolidated Sheet | click tile to navigate: award-list/admit-card/report-card go to `/exmcl/performas/*` editors; Datesheet to `/exmcl/datesheets`; Seating Plan to `/exmcl/seatingplan`; Duties to `/exmcl/duties`. Rechecking and Consolidated Sheet have no `href` (dead tiles). CNTR variant is a text-only `CentreRecordsUtilityPage` | board/dashboard | partial (2 of 8 tiles are placeholders) | any authed |
| `/exmcl/performas/award-list` | `ExmclAwardListFormat` (489 lines) | Design award-list PDF format | Live preview (inline `AwardListCopy` in the page, sample data) of school header, info row, student-marks table, signature row | see Format editor section below. Save format, Generate award lists (navigate `/exmcl/award-list`), Reset to template, image upload | settings + document-preview (canvas editor) | working (GET/PUT `/award-list/design`, POST `/award-list/design/image`) | any authed |
| `/exmcl/performas/admit-card` | `ExmclAdmitCardFormat` (431 lines) | Design admit-card PDF format | Live preview via `AdmitCardPreview` with hard-coded sample student (Aarav Sharma, 10th A, roll 12) and fallback school "INTL BHARTI SCHOOL, ROHTAK" | see Format editor section. Save format, Generate admit cards, Reset, signature uploads (principal / exam incharge), image upload | settings + document-preview (canvas editor) | working (GET/PUT `/admit-cards/design`, POST `/admit-cards/design/image`, POST `/admit-cards/design/signature/:role`) | any authed |
| `/exmcl/performas/report-card` | `ExmclReportCardFormat` (283 lines) | Design report-card PDF format | Live preview via `ReportCardPreview` (editable inline) with sample student Amayra, 3 sample subjects | see Format editor section. Only editor built on `FormatEditorShell`. Save, Generate, Reset, image upload | settings + document-preview (canvas editor) | working (GET/PUT `/report-card/design`, POST `/report-card/design/image`) | any authed |
| `/exmcl/centre-guidelines` | `ExmclCirculars` (372 lines; sidebar label "Circulars") | Draft and publish circulars | Form: Title, Date, Reference series, Reference number, Page size (A4/Legal/Letter), rich-text body. List: title, status Draft/Published, date, ref, page size, updated/published timestamps | create/update, Edit, Publish, Delete. `CircularRichTextEditor` uses `document.execCommand` (bold, italic, underline, lists, align, font size). No PDF/print generation in the page despite page-size field | form/wizard + list-table | partial (CRUD works via `/exam-circulars`; page size stored but no render/print path in client) | any authed |
| `/exmcl/admit-cards` | `ExmclAdmitCards` (366 lines) | Generate admit-card PDFs | Selectors Exam, Class, Section; admit-card count; live preview of first student (from `/students`) using saved design; subjects from student record | Download PDF (`POST /admit-cards`, blob), "Edit format" link to `/exmcl/performas/admit-card` | document-preview | working | any authed |
| `/exmcl/exams` | `ExmclExams` (276 lines) | Define session exams | Form: Exam name, Code, Duration, Maximum marks. Table: #, Exam Name, Code, Duration, M.M., Actions | create, edit, delete (`/exam-definitions` CRUD); duplicate-code check client-side | form/wizard + list-table | working | any authed |
| `/exmcl/result` | `ExmclResult` (955 lines) | Enter marks per exam, class, section | Tabs (single "Exam" tab); Exam/Class/Section selects; `ResultEntryStatusPanel` (per class-section completion); grid columns: Adm No, Photo, Roll No, Student Name, Abs checkbox, one column per class subject (from `subjectService` + timetable), Total (/M.M x subjects), % | type marks (validated <= M.M.), type `A/AB/ABS/ABSENT` or double-click cell to mark subject absent, Abs checkbox for all subjects, X to remove a subject column (local), Save (`POST /exam-results/bulk`) | matrix-grid | working (`exmclResultService` GET `/exam-results`, `/exam-results/status`). Deleted subject columns are local only | any authed |
| `/exmcl/report-card` | `ExmclReportCard` (657 lines) | Generate report cards | Exam/Class/Section selects; student table (checkbox, Adm No, Roll, Student Name, Father Name, Mother Name, Report Card actions); inline PDF preview panel via `react-pdf` | Preview single (blob PDF rendered in page), Download single, Download bulk (all or selected, `GET /report-card/bulk`), Edit format link to `/exmcl/performas/report-card` | list-table + document-preview | working (`exmclReportCardService`) | any authed |
| `/exmcl/award-list` | `ExmclAwardList` (368 lines) | Generate award-list PDFs | Exam, Class, Section, optional Subject text, optional Date; preview via `AwardListPreview` | Download PDF (`POST /award-list`, blob), Edit format link | document-preview | working | any authed |
| `/exmcl/question-papers` | `ExmclQuestionPapers` (18 lines) | Intended: question paper records | Static heading + one sentence | none | placeholder | placeholder | any authed |
| `/exmcl/syllabus` | `ExmclSyllabus` (18 lines) | Intended: syllabus records | Static heading + one sentence | none | placeholder | placeholder | any authed |
| `/exmcl/marks-distribution` | `ExmclMarksDistribution` (19 lines) | Intended: split 100 marks into theory/practical/enrichment/notebook per class and subject | Static heading + one sentence | none | placeholder | placeholder | any authed |

### Which EXMCL routes reuse CNTR pages

Reused with identical component and no `/exmcl/` branching (behaviour is the same as the unprefixed CNTR route): `CentreDetails`, `Teachers` (exam-functionaries), `TeacherDetail`, `Duties`, `Candidates`, `CandidateDetail`, `AnswerSheets`, `AnswerSheetDetails`, `Attendance`. A grep for `exmcl` in these files returns nothing.

Reused but behave differently under the exmcl prefix (they inspect `useLocation().pathname`):
- `SeatingPlan`: `isExmclRoute` loads `seatingPlanService.getSeatingPlanMode()` and renders the "Seating plan mode" card (same room every exam day vs different rooms per day).
- `RoomAllocation`: `isExmclRoute` swaps the data source to ASETS Locations (`getAsetsExamRoomCandidates`, `syncExamRoomsFromAsets`), changes headings/stat labels, adds Class/Section column and the embedded `ExamRoomLayoutDesigner`, and hides the date-wise allocation and CRUD actions.
- `Performas`: renders `ExmclFormats` hub instead of the CNTR letter-templates utility page.

Findings:
- Reused pages operate on CNTR/CBSE-centre data (candidates, centre datesheet, absentees, answer sheets). The truly internal-exam pages (`ExmclExams`, `ExmclDatesheets`, `ExmclResult`, `ExmclAdmitCards`, `ExmclReportCard`, `ExmclAwardList`) use students, `exam-definitions`, `datesheetService` with `examType: 'internal'`. Seating plan, duties and attendance under exmcl therefore do not see internal datesheets.
- Prefix leaks: TeacherDetail back goes to `/teachers`, CandidateDetail to `/candidate-details`, Candidates Add to `/candidates/new`, AnswerSheets row click to `/answersheets/:id`. Sidebar module context may change after those navigations.
- Sidebar (`Sidebar.tsx` ~1387-1412) lists: Circulars, Admit Cards, Exams, Result, Report Card, Award List, Question Papers, Syllabus, Marks Distribution, Subjects, Datesheets, Exam Room/Hall, Answer Sheets, Seating Plan, Duties, Attendance, Formats, Candidate Details, CBSE Registration (+ Centre Details and Exam Functionaries at ~1160-1170).
- Header (`Header.tsx` ~288-320) gives the three `/exmcl/performas/*` editor routes a back button to `/exmcl/performas`.

---

### Format editor and design canvases (`components/format-editor/*`, `components/exmcl/*`, `hooks/useFormatCanvas.ts`)

Three formats exist, registered in `formatRegistry.ts` (`FORMAT_REGISTRY`, ids `award-list`, `admit-card`, `report-card`). Each registry entry has generatePath, generateLabel, pageSizes, default page size/orientation, one template, and a `mergeFields` list (only used as help text in the report-card editor: `{{school.name}}`, `{{student.name}}`, `{{exam.name}}`, `{{class}}`; admit-card/award-list lists are defined but not rendered). Note: merge-field tokens are not resolved in the client; the admit card title uses a different `{exam}` token resolved server-side.

| format | default page | default orientation | template | generate path |
|---|---|---|---|---|
| award-list | A4 (A4, legal) | landscape | "Landscape marksheet": school header, class info row, student marks table, signature row | `/exmcl/award-list` |
| admit-card | A4 (A4, legal) | portrait | "CBSE-style admit card": photo, student particulars, subject table, instructions, signatures | `/exmcl/admit-cards` |
| report-card | A4 (A4, legal, letter) | portrait | "IB-style portrait": school header with logos, student details, scholastic table, signatures | `/exmcl/report-card` |

#### Shared primitives

- `types.ts`: `FormatCanvasItem` = `{id, type: text|image|rect|line, x, y, width, height (all % of the page), zIndex, text, imageUrl, fontFamily, fontSize, bold, italic, underline, color, align left|center|right, fill, stroke, strokeWidth}`. 10 fonts (Arial, Times New Roman, Georgia, Verdana, Trebuchet MS, Tahoma, Courier New, Comic Sans MS, Impact, Palatino Linotype). Font sizes 8..36 px. Paper sizes in mm: A4 210x297, Letter 215.9x279.4, Legal 215.9x355.6. `mergeCanvasItems` caps items at 40.
- `FormatToolbar.tsx`: top-of-canvas toolbar. Buttons: Text, Image (file input png/jpeg/webp, shows "Uploading..."), Box, Line, then selection label, Font select, Size select, Bold, Italic, Underline, colour picker (text or shape), Align left/center/right (text items only), Delete selected. Font controls disabled for image/shape items.
- `CanvasOverlay.tsx`: absolutely-positioned layer over the preview. Items are draggable (mouse), have 8 resize handles (nw, n, ne, e, se, s, sw, w), text items auto-fit their box to measured text (hidden probe span, `line-height:1.05`, 2px padding, clamped), double-click edits text in a `<textarea>`, Delete/Backspace removes the selected item, click on empty area deselects. Positions are percentages so they scale with the paper.
- `PageCanvas.tsx`: to-scale paper frame. Uses `ResizeObserver` to fit host width (max 720 px portrait / 980 px landscape), scales all paper sizes against the widest reference so switching A4/Legal/Letter visibly changes proportions, draws a bordered white sheet with shadow, a footer caption "A4 · portrait · 210 x 297 mm (w x h px)", and nests the bound-layer children plus the `CanvasOverlay`.
- `FormatEditorShell.tsx`: two-column layout (300 px inspector sidebar + canvas panel). Sidebar: title, description, inspector slot, buttons Save format, Generate (label from registry), Reset to template. Canvas panel: "Live preview · A4 · portrait" label, `FormatToolbar`, `PageCanvas`. Currently used ONLY by the report-card editor.
- `ToggleRow.tsx` also exports `segmentButton(active)` and `fieldClassName` style helpers.
- `useFormatCanvas(items, setItems, uploadImage)`: holds selectedId, uploading flag; `addItem(type, extras)` (new item at next zIndex, auto-selected), `addImage(file)` (uploads via the format's service then inserts an `image` item 24x16), `patchItem`, `removeSelected`, `applyStyle` (text items only).
- `components/exmcl/ReportCardCanvasLayer.tsx` is a one-line re-export of `CanvasOverlay` (legacy alias).
- Duplication: `ExmclAdmitCardFormat` and `ExmclAwardListFormat` do NOT use `FormatEditorShell`/`PageCanvas`; each re-implements the shell inline with its own `PAGE_ASPECT` map, `Toggle`, `segmentButton`, `selectClassName` and a CSS aspect-ratio paper (`min(100%, 640px)` / `520px` for portrait, 100% for landscape). `PageCanvas`'s to-scale sizing and Letter size are therefore only in the report-card editor.

#### Award list canvas (`ExmclAwardListFormat` + inline `AwardListCopy`)

Design object `AwardListDesign` (saved server-side per tenant): title (heading text), pageSize A4/legal, orientation landscape/portrait, copiesPerSheet 1|2, showHeader, showSchoolLogo, showSchoolAddress, showInfoRow, showMaxMarks, headerFields {class, section, exam, date, subject, mm}, columns {srNo, rollNumber (shown as "Adm No"), rollNo, name, fatherName, subjects, total ("M.O."), grade, checkerSign}, signatures {subjectTeacher, hod, examIncharge, principal}, extraMarkColumns (0 to 8, "Marks 1..n"), canvasItems.
Sidebar controls: Heading text input, Page size segmented (A4 / Lgl), Orientation segmented (Landscape / Portrait), toggle "2 award lists on one sheet", Header toggles (school name, address, logo, header fields), Header-field toggles (6), Column toggles (9) plus a numeric input for extra mark columns, Signature toggles (4), buttons Save format, Generate award lists, Reset to template.
Canvas: paper-aspect box; for 2-up it renders two copies side by side in compact (9 px) type. Each copy shows: optional logo (from school profile, else an empty 40 px square), school name (uppercase, from `schoolProfileService.getProfile()` with fallback "DELHI PUBLIC SCHOOL, ROHTAK"), optional address, heading; an info row of editable underline "FillLine" inputs (Class, Section, Exam, Date, Subject, M.M., sample values 10th / A / Unit Test / blank / blank / 80; typing in them only affects the preview); a 4-row empty marks table (S.No, Adm No, Roll No, Student Name, Father Name, subject columns (sample English/Mathematics/Science, or the typed subject), extra Marks n, M.O., Grade, Checker Sign); a 2x2 signature grid (Subject Teacher, HOD / Exam Incharge, Principal). `CanvasOverlay` sits over the copy for free-form items. Only the first copy's canvas overlay is positioned over the whole sheet.
Output: no client-side rendering; server produces the PDF from the saved design (`POST /award-list` with examId, class, section, subject, examDate).

#### Admit card canvas (`ExmclAdmitCardFormat` + `AdmitCardPreview`)

Design object `AdmitCardDesign`: title (default "ADMIT CARD FOR {exam}", `{exam}` replaced by exam name), pageSize A4/legal, orientation portrait/landscape, copiesPerSheet 1|2, showHeader, showSchoolLogo, showSchoolAddress, entryNote + showEntryNote ("LATEST ENTRY IN EXAMINATION CENTRE 30 MIN BEFORE THE EXAM START"), instructions (8 numbered default lines) + showInstructions, confirmationText + showConfirmation ("ALL PARTICULARS ... FOUND CORRECT"), disclaimer + showDisclaimer, `fields` (photo, rollNo, dob, schoolNo, centreNo, rollNoInWords, exam, name, motherName, fatherName, gender, schoolName, examCentre, pwdCategory, admitCardId, subjects, qr, class, section (default off), admissionNo (default off)), `signatures` (candidate, parent, examIncharge, principal, plus examInchargeDigital/principalDigital with uploaded signature URL + Cloudinary public id), canvasItems.
Sidebar controls: Title input, Page size, Orientation, 2-up toggle, Header toggles (school name, logos, address, entry note + textarea), 19 Field toggles, Instruction toggles (show instructions + 6-row textarea, confirmation line, disclaimer), Signature toggles with per-role "Digital sign" sub-toggle and "Upload signature" file input (png/jpeg/webp; saved immediately via `POST /admit-cards/design/signature/{principal|examIncharge}`), Save format, Generate admit cards, Reset to template.
Preview (`AdmitCardPreview`, 287 lines, also used by the generation page): CBSE-style card with header (logos, school name, optional address), entry-note banner, title, key/value block (`Kv`: Candidate's Name, Mother's/Father's Name, Gender, School, Exam Centre, DOB, etc.), Roll No box and "Roll No. (In words)" via `numberToIndianWords` (Indian lakh/crore wording), 72x88 photo placeholder box, 84x84 "QR" placeholder box (static, no real QR rendered), subject table (code, name, medium, date; default sample 4 subjects), instructions list, confirmation line, signature row (Candidate, Parents, Exam Incharge, Principal with optional signature image), disclaimer in red. 2-up mode scales type via `compact`. Sample data in the editor is hard-coded (Aarav Sharma, Rajesh Sharma, 10th A, roll 12, adm 3361, DOB 24.10.2010, ID ACUT12; exam "SECONDARY EXAMINATION"; school fallback "INTL BHARTI SCHOOL, ROHTAK", code 40291).
Output: server PDF (`POST /admit-cards` with examId, class, section; blob download named `admit-cards_{exam}_{class}-{section}.pdf`).

#### Report card canvas (`ExmclReportCardFormat` + `ReportCardPreview` via `FormatEditorShell`)

Design object `ReportCardDesign`: schoolName, tagline, schoolCode, address, affiliationNo ("CBSE Aff. No"), email, contact, pageSize A4/legal/letter, orientation, show flags (header, schoolLogo, cbseLogo, tagline, schoolCode, address, affiliation, email, contact, attendance, remarks, date), signatures {classTeacher, principal}, `labels` (14 editable captions: studentDetails, scholasticArea, subjects, maxMarks, marksObtained, grade, grandTotal, percentage, overallGrade, attendance, remarks, date, classTeacherSign, principalSign), `styles` (10 text-style slots: schoolName 30px bold, tagline 12px italic, meta, examTitle 14 bold, sectionHeading 14 bold italic, studentFields, tableHeader bold, tableBody, footer, signatures; each fontFamily/fontSize/bold/italic/underline), `columnWidths` (subjects, maxMarks, marksObtained, grade; percent, min 10), canvasItems. Default content is school-specific ("I.B. SCHOOL", tagline "Always Learning, Learning All Ways.....", code 40291, aff 530316, address Gohana Road Rohtak, contact@ibsrohtak.com).
Inspector: page-size segmented (A4 / Lgl / Ltr), orientation, 6 text inputs (School name, Tagline, School Code, CBSE Aff. No, Email Id, Contact No) + Address textarea, Header toggles (9), Footer toggles (Attendance, Remarks, Date, Class Teacher sign, Principal sign), merge-field help line.
Canvas: this is the richest editor. `ReportCardPreview` (604 lines, `editable` mode) renders inline-editable fields: school name, tagline, address/contact, exam title, "Student Details" and "Scholastic Area" headings and every table caption are real `<input>/<textarea>` elements (`EditableText`) writing back into design.labels/fields; clicking a block selects one of the 10 style slots, shown with a blue ring, and the toolbar font/size/bold/italic/underline then edits that slot (when a free canvas item is selected the toolbar edits the item instead). The scholastic table has draggable column dividers (mouse drag, min 10 % per column, widths persisted). Preview content: CBSE circular logo placeholder (text "CBSE" in teal ring), school logo from profile, student block (Name, Mother Name, Gender, Adm. No, Class & Section, Father Name), table (Subjects, Max Marks, Marks Obtained, Grade) with 3 sample subjects, Grand Total row, Percentage and Overall Grade row, Attendance and Remarks lines, Date, Class Teacher / Principal signature lines. Sample: exam title "PERIODIC TEST – 2 (2026-27)", student Amayra, 4th - Lily, 120 max, 101 obtained, 84.17 %, A2.
Output: server PDF per student/bulk (`GET /report-card/single`, `GET /report-card/bulk`), preview in the generation page via react-pdf. The generation page is the only place the PDF is rendered back to the user; editor preview is HTML not PDF, so fidelity depends on the server template matching the designer.

#### Other EXMCL components

- `ResultEntryStatusPanel.tsx` (245 lines): collapsible panel summarising mark-entry progress per class-section: statuses complete (emerald), partial/"In progress" (amber), pending/"Pending" (slate); summary counts for complete/partial/pending sections, pending subjects and pending cells, per-section percentage bars, expand to per-subject status, click a row to select that class/section in the result grid.
- `ExamRoomLayoutDesigner.tsx` (290 lines): per-room seating layout designer used on `/exmcl/examrooms`; room list sorted by room no, expandable row editor of layout rows `{benchCount, benchType}` (BENCH_TYPE_OPTIONS), capacity calculation via `calculateRowSeats/calculateLayoutCapacity`, total capacity, Save per room and Save all (`seatingPlanService`), pending-save count badge.
- `CircularRichTextEditor.tsx` (138 lines): contentEditable editor, toolbar Bold, Italic, Underline, bullet list, numbered list, align left/center/right, font size (execCommand `fontSize` 7 then CSS conversion).

---

## ATTND (Attendance)

### Route table

| route | page component | purpose | main data shown | primary actions | page type | completeness | role |
|---|---|---|---|---|---|---|---|
| `/attnd` | `<Navigate>` | Redirect to `/attnd/attndboard` | none | redirect | n/a | working | any authed |
| `/attnd/attndboard` | `Attndboard` (259 lines) | Attendance snapshot for students and staff | Header "Attendance snapshot for {date}" + working days; 8 stat cards: Students present, Student absentees, Staff present, Staff absentees, Student half days, Staff half days, Student strength, Staff strength (each with today and month hints); "Class absence matrix" (class rows x section columns, cell = month absent count + "today n", heat coloured); "Staff absence matrix" (horizontal bars per staff group with today and HD counts); "Daily absenteeism" bar chart (student + staff absences per day, Sundays grey) | Month switcher only; no export, no drill-down | board/dashboard | working (`GET /attnd/dashboard?month&date`). Half-day figures are shown but nothing in ATTND UI can create half-days (see codes) | any authed |
| `/attnd/staff-attendance` | `AttndStaffAttendance` (407 lines) | Mark staff absences | Monthly grid: rows = staff of selected type (Sr, Emp ID, Name), columns = days of month with weekday initials; toolbar Staff type, Designation, Month, search, counters Working / Present / Absent. When header mode switch = "Daywise" renders `AttndStaffDaywiseMatrix`: one column per staff type for one date | tick absence checkbox per day, click a date header to toggle working/holiday, Save Attendance (`PUT /attnd/staff`), search by name/emp ID, date switcher in daywise mode, Working day/Holiday toggle in daywise | matrix-grid | partial. Absences persist, but in monthly mode holidays are NOT sent or loaded (only `staffIds`, `absences`), so day categories reset to Sunday-only on every reload; no half-day or leave types | any authed |
| `/attnd/student-attendance` | `AttndStudentAttendance` (417 lines) | Mark student absences | Monthly grid: rows = students of class+section (Sr, Adm No, Name), columns = days; toolbar Class, Section, Month, search, counters Working / Present / Absent. "Daywise" mode renders `AttndDaywiseMatrix`: all class-sections as columns for one date, student names stacked with a checkbox each | tick absence per day, click day header (monthly) or class-section header (daywise) to toggle academic/holiday, Save Attendance (`PUT /attnd/students` with absences + daySettings), search, auto-scrolls to today column | matrix-grid | working (day categories per date, and per class-section in daywise, are persisted via `daySettings`) | any authed |

Supporting pieces:
- `contexts/AttndMatrixModeContext.tsx`: `AttndMatrixMode = 'classwise' | 'daywise'`, persisted in `sessionStorage` key `attnd-matrix-mode`, provided by `Layout.tsx`. Default `classwise`.
- `components/attnd/AttndModeSwitch.tsx`: segmented switch rendered inside `Header.tsx` only when the route matches `/attnd/student-attendance` or `/attnd/staff-attendance`; labels "Classwise | Daywise" for students, "Typewise | Daywise" for staff.
- `DateSwitcher` (prev/next day, shows `dd.mm.yy`), `MonthSwitcher` (prev/next month, shows "Mon yy").
- `utils/attndStaffTypes.ts`: staff type buckets Teaching, Sports Coach, Admin, Class IV, Drivers, Conductors, Security, Other, derived from `dutyType` and `designation` text.
- `services/attndService.ts`: endpoints `/attnd/staff-directory`, `/attnd/student-filters`, `/attnd/student-directory`, `/attnd/staff`, `/attnd/students`, `/attnd/dashboard`. Type `AttendanceStatus = 'P' | 'A' | 'HD'`.
- `hooks/useAttendance.ts`: NOT part of ATTND. It wraps `attendanceService` (`/attendance/absentees` and report download) and is used by the CNTR/EXMCL `Attendance` page, `AnswerSheets` and `DispatchSlip`. Exports `attendanceKeys`, `useAttendanceAbsentees`, `useSaveAbsenteesMutation`, `useUploadAttendanceMutation`, `useAbsenteeReportMutation`. ATTND pages use plain `useState/useEffect` plus `attndService`, no React Query.
- Sidebar entries (`Sidebar.tsx` ~510-523, 1098): Attndboard, Staff Attendance, Student Attendance. `moduleRegistry` default route `/attnd/attndboard`.

### Attendance marks / codes and colours

The model is "absent-only": only absences are stored; anything not ticked is implied present. There is no per-cell code letter rendered in the grids, state is a checkbox plus cell background.

| mark / state | code | where | how represented | colour |
|---|---|---|---|---|
| Present | `P` (type only; implied by no absence) | student and staff grids | unchecked checkbox; counted as total minus absent | counter chip emerald (`bg-emerald-50`, text `emerald-700/800`, border `emerald-200`); dashboard "present" cards `bg-emerald-50 text-emerald-600` |
| Absent | `A` (stored as `status: 'A'`; staff records have no status field and are implied absent) | all grids | checked checkbox, `text-rose-600` accent, focus ring rose-500 | counter chip rose (`bg-rose-50`, `rose-700/800`, border `rose-200`); dashboard "absentees" cards `bg-rose-50 text-rose-600` |
| Half day | `HD` (type `AttendanceStatus`, `todayHalfDay`, `monthHalfDay`, `staffHalfDay`, `studentHalfDay` in dashboard) | Attndboard only; no UI to set it | read-only counters | stat cards `bg-amber-50 text-amber-600` and `bg-sky-50 text-sky-600` (student and staff half day cards) and `bg-orange-50` tone for the next card; "HD n" text in staff matrix rows |
| Holiday / non-academic day | category `non-academic` | day column header (monthly), class-section column header (student daywise), "Holiday" button (staff daywise) | header and column background tinted, checkboxes disabled and cleared; weekday label under the day number turns rose | column header `bg-rose-50` (dark `rose-950/30`), cells `bg-rose-50/80`, weekday text `text-rose-700`; staff daywise "Holiday" button `border-rose-200 bg-rose-50 text-rose-700` |
| Academic / working day | category `academic` (default for non-Sundays) | same headers | weekday label under day number | weekday text `text-emerald-700`; staff "Working day" button `border-emerald-200 bg-emerald-50 text-emerald-700` |
| Sunday | default `non-academic` | all monthly grids, daywise default | auto-holiday unless overridden | same rose holiday styling; dashboard daily trend bar `bg-slate-200` (height fixed 8 px) and caption "Grey bars are Sundays" |
| Today | not a mark | monthly grids | highlighted column and auto-scroll | header `bg-indigo-50` with `ring-indigo-400`, cells `bg-indigo-50/70` |
| Working-days counter | not a mark | toolbar | count chip | neutral slate (`bg-slate-50`, `border-slate-200`) |
| Dashboard absence heat | ratio of month absences to max | class matrix cells and staff bars | 0 = `bg-emerald-50 text-emerald-800`; ratio < 0.4 = `bg-rose-50 text-rose-800`; 0.4 to <0.7 = `bg-rose-200 text-rose-900`; >= 0.7 = `bg-rose-500 text-white` | as listed |
| Daily trend bar | working day | Attndboard | height proportional to student + staff absences | `bg-indigo-500` |

Not present anywhere in ATTND UI: leave types (CL/SL/EL), late, on-duty, biometric/QR input, per-period attendance, import/export, parent notifications, or reports. The ATTND module is therefore absence-ticking + dashboard only.

<!-- 05_routes_cpitl_asets_actvt_trnst_mdcl -->
## Client route audit: CPITL, ASETS, ACTVT, TRNST, MDCL

Source: `client/src/App.tsx` lines 373-435, plus the page files. All routes sit inside `<ProtectedRoute>` and `<Layout>`.

**Role / access (applies to every row below).** There is no per-route role guard. `ProtectedRoute` only checks three things: the user is authenticated, an academic session is selected, and the path is enabled in `user.featureToggles` (`isFeatureEnabledForPath`; billing `core_only` mode blocks these modules). So the "role" column is "any authenticated tenant user (Admin / Data Entry Operator) with the module feature toggle on". Role checks, if any, happen server-side. The `role` column below repeats this.

Paths are shown as written in App.tsx. All are under the `HashRouter`, so a URL looks like `/#/cpitl/dashboard`.

---

## CPITL (Capital / Finance) -- data-backed

Almost entirely data-backed. It uses React Query hooks in `hooks/useCpitl.ts` (about 35 hooks with a `cpitlKeys` key factory) over `services/cpitlService`. Mutations call the service directly and then invalidate the `cpitl` query keys. No mock data, TODO or "coming soon" strings were found. `utils/cpitlFees.ts` is a client-side mirror of the server `feeSchedule.js`, used for live installment preview in the editors. The dashboard also reads the redux auth state (`useSelector`).

Shared UI is in `components/cpitl/`:
- `CpitlUi`: page shell, cards, stat cards, fields.
- `CollectPaymentModal`.
- `StudentLedgerPanel`.
- `QuickExpenseSheet`.
- `CategoryManager`, `IconPicker`, `AttachmentInput`.
- `StaffSalaryCard`, `StructureArchiveDialog`.

| route | page component | purpose | main data shown | primary actions | page type | completeness | role |
|---|---|---|---|---|---|---|---|
| `/cpitl` | (redirect) | Redirects to `/cpitl/dashboard` | n/a | n/a | n/a | working | any authed, module on |
| `/cpitl/dashboard` | `CpitlDashboard` | Fee collection overview for the selected session | Stat cards (session demand, collected, pending, overdue, today); class-wise table (class, students, demand, received, pending, overdue); monthly collection chart; by-payment-mode; income vs expenses; structure coverage (students with a structure vs active) | Print class or section fee slips (PDF via `openClassSlips`); links to Collection, Fee Structures, Expenses | board/dashboard | working (`useCpitlDashboard`) | any authed, module on |
| `/cpitl/fee-structures` | `CpitlFeeStructures` | List the class-wise fee structures | Structure cards: name, classes, annual total, status/archived, updated date | New; Duplicate; Archive (`StructureArchiveDialog`); open detail; link to fee heads in Settings | list-table (card list) | working | any authed, module on |
| `/cpitl/fee-structures/:id` (`new` is also used as an id) | `CpitlFeeStructureDetail` | Create or edit a versioned fee structure | Name, description, classes; component table (fee head, frequency, amount per installment, optional, per year); installment plan (due day, one-time/annual/half-yearly/quarterly months); live month-by-month schedule preview; late-fee rules; revision history | Save with change note; Duplicate; Assign to students; Re-apply to students; View revision (`getRevision`); Archive | form/wizard (plus detail) | working | any authed, module on |
| `/cpitl/collection` | `CpitlCollection` | Find a student and collect fees | Student search by name, class, section; matching student list with dues | Open student ledger; collect payment from the ledger | list-table (search) | working | any authed, module on |
| `/cpitl/students/:id` | `CpitlStudentLedger` (thin wrapper around `StudentLedgerPanel`) | Student fee account and ledger | Fee structure assigned, previous-session arrears, installment table (installment, due date, heads, amount, paid, status), concessions/discounts (name, applies to, type, reason), receipts | Assign structure; set arrears; add or remove concession; Collect payment (`CollectPaymentModal`: date, late fee, mode, bank, UTR, remarks); open receipt PDF | detail | working | any authed, module on |
| `/cpitl/fee-slips` | `CpitlFeeSlips` | Bulk-print fee slips for a class or section | Filters: class, section, "include dues up to" date | Generate slips PDF (parent copy and school copy, `openClassSlips`) | form (generator) | working | any authed, module on |
| `/cpitl/payments` | `CpitlPayments` | Receipts day book | Table: receipt no., date, student (link to ledger), mode, amount, status; filters (class etc.) | Open receipt PDF (`openReceipt`) | list-table | working | any authed, module on |
| `/cpitl/settings` | `CpitlSettings` | Fee heads and capital settings | Fee-head table (name, code, category, default frequency, flags); settings (receipt prefix and others); expense categories (`CategoryManager`) | Create, edit or delete a fee head; save settings | settings | working | any authed, module on |
| `/cpitl/expenses` | `CpitlExpenses` | Expense summary hub | Stat cards (spent this session, this month, fee income); by-expense-type with links; income vs expenses by month; monthly statement (per kind, total, income, net); top operating categories; recent expenses | Link to Operating (add expense) and to the other expense modules | board/dashboard | working | any authed, module on |
| `/cpitl/operating` | `CpitlOperating` | Day-to-day operating costs by category | Month navigator; category tiles with % of monthly budget; expense list (date, category, amount, mode, attachment link) | Add or edit expense (`QuickExpenseSheet`, attachments); Void expense; month prev/next | list-table | working | any authed, module on |
| `/cpitl/fuel` | `CpitlFuel` | Vehicle fuel logs and analytics | Vehicles (registration, bus no., last odometer); fuel log (date, fuel type, litres, rate, amount, odometer, station, bill no., filled by, paid by); analytics and projection | Add or remove a fuel log; Download fuel projection (`downloadFuelProjection`, a file download) | list-table (plus analytics) | working | any authed, module on |
| `/cpitl/electricity` | `CpitlElectricity` | Electricity connections and bills | Connections (name, consumer no., meter, provider, sanctioned kW, location from Assets); bills (month, previous and current reading, units, amount); analytics | Save connection; Save or remove bill; Mark bill paid (`payElectricityBill`) | list-table (plus analytics) | working | any authed, module on |
| `/cpitl/infra` | `CpitlInfra` | Infrastructure projects list | Projects (title, type, status, sanctioned budget, vendor, dates, location from Assets, scope) | Create or edit project | list-table | working | any authed, module on |
| `/cpitl/infra/:id` | `CpitlInfraDetail` | Project detail: payments, milestones, documents | Project summary and budget vs paid; payments (amount, date, paid to, mode, reference, purpose, invoice attachment); milestones with due dates; documents | Add payment; Void payment; add or remove milestone; upload documents; edit project | detail | working | any authed, module on |
| `/cpitl/budgets` | `CpitlBudgets` | Session budgets vs actuals | Table: budget head, session budget, spent, % used, year-end estimate, next-year suggestion; growth % input | Save budgets; Copy from actuals (`copyBudgetsFromActuals`) | matrix-grid (editable) | working | any authed, module on |
| `/cpitl/salary` | `CpitlSalary` | Staff salary structures and salary components | Tab "Staff": staff list with salary and net/gross preview; per-staff earnings and deductions, TDS, effective-from, history note. Tab "Components": component (name, code, type, calculation, default value); payroll settings (PF rate and ceiling, ESI employee and employer) | Save staff salary; Save or archive component; Save payroll settings | settings (tabbed) | working | any authed, module on |
| `/cpitl/payroll` | `CpitlPayroll` | Payroll runs list | Table: month, staff, gross, deductions, net, employer PF+ESI, status, paid on | Create a payroll run for a month; open run | list-table | working | any authed, module on |
| `/cpitl/payroll/:month` | `CpitlPayrollRun` | Process one month's payroll | Per-staff rows (LOP days, arrears, other deductions, gross, deductions, net); expandable breakdown; remarks; pay dialog (paid on, mode, reference) | Edit and save; Finalize; Pay; Reopen (voids the salary expense); Delete draft; Payslips PDF (all or one, `openPayslips`); Download bank sheet | form/wizard (state machine: draft, finalized, paid) | working | any authed, module on |

---

## ASETS (Asset Management) -- data-backed

All pages call `asetsService` directly with `useState` / `useEffect`. There is no React Query and no redux. Toasts are used for errors, and there is no mock data. Shared UI is in `components/asets/AsetsUi.tsx` (page shell, card, status badge, empty state, QR panel) and `components/asets/locations/*` (`LocationTree`, `LocationDetailPanel`, `LocationFormModal`).

Routed components live in three files:
- `AsetsSimplePages.tsx`: generic `SimpleCrudPage`, plus `AsetsCategories` and `AsetsVendors`. `AsetsLocationsLegacy` is exported but not routed (dead code).
- `AsetsWorkflowPages.tsx`: Allocations, Transfers, Maintenance, Stock, Audits, Procurement, Disposals, Reports, Settings.
- Standalone files for Dashboard, Assets, AssetDetail, Locations, LocationDetail.

| route | page component | purpose | main data shown | primary actions | page type | completeness | role |
|---|---|---|---|---|---|---|---|
| `/asets` | (redirect) | Redirects to `/asets/dashboard` | n/a | n/a | n/a | working | any authed, module on |
| `/asets/dashboard` | `AsetsDashboard` | Asset overview | KPI/stat cards from `getDashboard`; attention items; recent assets (link to detail) | Link to All Assets; drill into an asset | board/dashboard | working | any authed, module on |
| `/asets/assets` | `AsetsAssets` | Asset register | Table: asset (ID, name), category, location, custodian, condition, value, status; filters (search by ID/name/serial/barcode, status, condition, category, location) | Create asset; Bulk-create assets; open asset | list-table | working | any authed, module on |
| `/asets/assets/:id` | `AsetsAssetDetail` | Asset profile | Name, asset ID, category; status and condition (editable); QR/barcode panel (`AsetsQrPanel`, from `qrPayload`); history | Edit status and condition (`updateAsset`) | detail | working (QR is a display panel only, no label printing) | any authed, module on |
| `/asets/categories` | `AsetsCategories` (`SimpleCrudPage`) | Hierarchical categories and subcategories | Category list with fields | Create, edit, delete category | list-table (CRUD) | working | any authed, module on |
| `/asets/locations` | `AsetsLocations` | Campus, block, floor, room tree | `LocationTree`; summary counts; search; `LocationDetailPanel` with tabs for blocks, floors, rooms and assets (asset, category, status) | Add block, floor or room; edit location (`LocationFormModal`); search | board (tree plus detail) | working | any authed, module on |
| `/asets/locations/:id` | `AsetsLocationDetail` | Location detail page | Location name and path; assets at the location; child locations | Back to locations; remove location | detail | working (thin, 44 lines) | any authed, module on |
| `/asets/allocations` | `AsetsAllocations` | Assign assets to locations or custodians | Allocation list with history; asset and location selectors | Allocate; Return allocation (`returnAllocation`) | form plus list-table | working | any authed, module on |
| `/asets/transfers` | `AsetsTransfers` | Move assets between locations | Transfer list (immutable history events); asset and destination selectors | Create transfer | form plus list-table | working | any authed, module on |
| `/asets/maintenance` | `AsetsMaintenance` | Corrective and preventive maintenance | Tickets: asset, priority, vendor, status, cost, warranty | Create ticket; update status (`updateMaintenance`) | form plus list-table | working | any authed, module on |
| `/asets/stock` | `AsetsStock` | Consumable stock / store | Stock items: location, quantity | Save item; Adjust stock (`adjustStock`) | form plus list-table | working | any authed, module on |
| `/asets/audits` | `AsetsAudits` | Physical verification audits | Audit list; selected audit's items with expected, found and missing state | Create audit (scope: location or category); Scan asset ID / barcode / QR payload (`scanAudit`); update item state (`updateAuditItem`) | form plus detail (scan workflow) | working (scan is a text-input payload, no camera) | any authed, module on |
| `/asets/vendors` | `AsetsVendors` (`SimpleCrudPage`) | Suppliers and service providers | Vendor list | Create, edit, delete vendor | list-table (CRUD) | working | any authed, module on |
| `/asets/procurement` | `AsetsProcurement` | Record acquisition and receive into assets or stock | Procurement records: vendor, category, location, tracking mode | Create procurement; generate assets or stock on receipt | form plus list-table | working | any authed, module on |
| `/asets/disposals` | `AsetsDisposals` | Formal disposal workflow | Disposal records: asset, reason, status | Raise disposal request (approval depends on settings) | form plus list-table | working | any authed, module on |
| `/asets/reports` | `AsetsReports` | 16 report types | Generic table: first 8 keys of the first row, max 200 rows. Types: register, by-category, by-location, by-department, by-custodian, valuation, maintenance, warranty, transfers, audits, missing, damaged, disposal, procurement, stock, lifecycle | Switch report type | list-table (generic) | partial: live API but no export (no CSV/PDF/Excel), no date filters, raw column keys as headers, JSON-truncated objects | any authed, module on |
| `/asets/settings` | `AsetsSettings` | Module defaults | Warranty alert days, audit due days, allow negative stock, disposal approval, transfer approval | Save settings (`updateSettings`) | settings | working | any authed, module on |

---

## ACTVT (Activities) -- mostly data-backed

All pages call `api.get/post/put/delete` (axios) against `/actvt/*`, with local `useState`. No redux and no React Query. `ActvtFunctions` and `ActvtTours` use the generic `RecordManager` (`components/records/RecordManager`) with `makeRecordService`, so they are card-list CRUD only (search plus form). House and club logos and flags are uploaded as multipart with an image crop dialog. Certificates are printed with `window.print()` and a print stylesheet, not a PDF generator.

Shared components: `ClubEditModal`, `HouseEditModal`, `HouseFlagFly` (flag animation).

| route | page component | purpose | main data shown | primary actions | page type | completeness | role |
|---|---|---|---|---|---|---|---|
| `/actvt` | (redirect) | Redirects to `/actvt/houses` | n/a | n/a | n/a | working | any authed, module on |
| `/actvt/houses` | `ActvtHouses` | House system overview | House cards with logo, colours and stats (`/actvt/houses/stats`) | Create house (logo upload and crop); Delete; open detail | list-table (cards) | working | any authed, module on |
| `/actvt/houses/:id` | `ActvtHouseDetail` | House profile | House header and flag; teachers in house; house council members; wall of fame; points and activity details (`/actvt/houses/:id/details`) | Edit house; Upload or crop flag; manage members | detail | working | any authed, module on |
| `/actvt/student-council` | `ActvtStudentCouncil` | School council and house councils | Council board (`/actvt/councils/board`): posts, seats, preferred gender and class, registrations; student search (`/students`, `/students/stats`) | Create, edit or delete post; Assign student; Registration approve or reject (`council-registrations`) | board | working | any authed, module on |
| `/actvt/students/:id` | `ActvtStudentProfile` | Student activity profile | Student header; wall of fame; participation (clubs, houses, events); engagement snapshot; certificates | Select a certificate and print (`window.print()`) | detail | working (read-only plus print) | any authed, module on |
| `/actvt/clubs` | `ActvtClubs` | Clubs list | Club cards with logo | Create club (logo upload and crop); Delete; open detail | list-table (cards) | working | any authed, module on |
| `/actvt/clubs/:id` | `ActvtClubDetail` | Club profile | Club details; members; activities (`/actvt/clubs/:id/details`) | Edit club; logo upload, crop, replace or remove; manage members | detail | working | any authed, module on |
| `/actvt/board` | `ActvtBoard` | Activity records board (tabs: overview, calendar, scores, criteria) | Events (`/actvt/events`), scoring criteria, houses, ranking, points ledger; month calendar | Create, edit or delete events; Create, edit or delete criteria; Award or delete points | board/dashboard (tabbed, 1269 lines) | working | any authed, module on |
| `/actvt/calendar` | `ActvtBoard` (same component; `ActvtCalendar.tsx` is a one-line re-export) | Alias of the board | Same as board | Same as board (the calendar tab is not preselected from the route; it is state only) | board/dashboard | working (alias route, not a distinct page) | any authed, module on |
| `/actvt/ranking` | `ActvtHouseRanking` | House standings | House standings from `/actvt/ranking`; points ledger | Award points; Delete points entry | list-table / board | working | any authed, module on |
| `/actvt/certificates` | `ActvtCertificates` | Generate and print certificates | Houses and events pickers; list of issued certificates | Generate certificates (batch); Delete; Print (`window.print()`, hidden print layout) | form plus document-preview | working (browser print, not server PDF) | any authed, module on |
| `/actvt/tours` | `ActvtTours` | Tours and trips records | Card list: title, destination, dates, classes, itinerary, students (free text), feedback | Add, edit, delete record; search (`RecordManager`) | list-table (generic CRUD) | partial: data-backed but free-text only; students are not linked to Student; no budget, consent or attendance | any authed, module on |
| `/actvt/sports` | `ActvtSports` | Sports facilities and activities | Facilities (seeded defaults such as Table Tennis, Court type, colour); sports activities linked to events | Add, edit or delete facility; Add, edit or delete sports activity | list-table / board | working | any authed, module on |
| `/actvt/functions` | `ActvtFunctions` | School functions records | Card list: title, type (Annual Day, Independence Day etc.), date, venue, incharge, plan, outcome | Add, edit, delete record; search (`RecordManager`) | list-table (generic CRUD) | partial: data-backed but free-text only | any authed, module on |

---

## TRNST (Transport) -- data-backed

All pages use `trnstService` (axios on `/trnst/*`) with `useState` / `useEffect`. There is no React Query and no redux. The page files sit at `pages/Trnst*.tsx`, not in a `pages/trnst/` folder. The service types are `TransportVehicle`, `TransportRoute` (with stops) and `SelfStudentRecord`.

| route | page component | purpose | main data shown | primary actions | page type | completeness | role |
|---|---|---|---|---|---|---|---|
| `/trnst` | `TrnstOverview` | Transport summary | Stat cards (vehicles and running, routes and stops mapped, seat capacity, self students); panels for vehicles, routes and self students | Links to Manage vehicles, Manage routes and Manage self students | board/dashboard | working (`getOverview`) | any authed, module on |
| `/trnst/vehicles` | `TrnstVehicles` | Fleet register | Bus no., registration, type (Bus/Mini Bus/Van/Winger/Other), make, model, colour, capacity, driver (name and phone, optionally linked to staff `driverId`), conductor, insurance expiry, fitness expiry, status (active/maintenance/inactive) | Add, edit, delete vehicle | form plus list-table | working | any authed, module on |
| `/trnst/routes` | `TrnstRoutes` | Routes and stops | Name, code, vehicle, shift (morning/afternoon/both), start and end point, distance km, stops (name, landmark, pickup and drop time, sequence), active flag | Add, edit, delete route; stop editor | form plus list-table | working | any authed, module on |
| `/trnst/self-students` | `TrnstSelfStudents` | Students who do not use school transport | Student, roll no., class and section, commute mode (Walk/Bicycle/Parent drop/Own vehicle/Other), guardian phone, notes | Add (pick from students), edit, delete; filter | form plus list-table | working | any authed, module on |

Gap: there is no student-to-route / stop assignment page and no student transport allocation. The module currently covers fleet, routes and "self students" only. The CPITL fuel page reads vehicles separately (`fuelVehicles`), so the two registers are not obviously unified.

---

## MDCL (Medical) -- data-backed, minimal

Both pages are thin wrappers over the generic `RecordManager` and `makeRecordService('/mdcl/...')`. It is a card list plus a form, with search and delete.

| route | page component | purpose | main data shown | primary actions | page type | completeness | role |
|---|---|---|---|---|---|---|---|
| `/mdcl` | (redirect) | Redirects to `/mdcl/cases` | n/a | n/a | n/a | working | any authed, module on |
| `/mdcl/cases` | `MdclCases` | Infirmary visit log | Date, student name (free text, not linked to Student), class, section, complaint, first aid, minor treatment, prescription, supplies used (free text), attended by, notes | Add, edit, delete; search | list-table (generic CRUD) | partial: working API, but free-text student, no link to supplies stock, no reports, no parent notification, no student health profile | any authed, module on |
| `/mdcl/supplies` | `MdclSupplies` | Medical supplies inventory | Item name, category, unit, quantity on hand, reorder level, storage location, expiry date, notes | Add, edit, delete; search | list-table (generic CRUD) | partial: no low-stock or expiry alerts despite the fields, no deduction from cases | any authed, module on |

---

## Summary

- **Data-backed vs local/mock:**
  - All five modules are backed by real APIs. CPITL uses React Query; ASETS, ACTVT, TRNST and MDCL use direct axios with local state. No redux slice is used by these modules.
  - No hardcoded datasets, mock data, TODO markers or "coming soon" text were found in any of the five scopes. The only seed-like code is the default sports facility list in `ActvtSports`.
  - The "partial" ratings come from thin or generic implementations, not mocks.
- **Placeholder pages:** none. `/actvt/calendar` is an alias to `ActvtBoard`. `ActvtCalendar.tsx` is a one-line re-export and is not routed. `AsetsLocationsLegacy` in `AsetsSimplePages.tsx` is exported but not routed.
- **PDF / export surface:**
  - CPITL has server-rendered PDFs: class fee slips, receipts, payslips. It also has file downloads: the bank sheet and the fuel projection.
  - ACTVT certificates use `window.print()` only.
  - ASETS reports have no export at all.
- **Role gating:** no route-level role checks anywhere. Access depends on the feature toggle plus the server.

---
# SECTION 3 - Shared components

### 3.1 Headline findings

- There is **no** shared `DataTable`, `StatusBadge`, `EmptyState`, `PageHeader`, `Pagination` or `FilterBar` component. Every one is re-implemented per module (see 3.4).
- `components/common` holds only: Dialog, Dropdown, Tabs, Modal, ExportModal, ImageCropModal, Loader. Adoption is low (Dialog 5 files, Dropdown 7, Tabs 8, Modal 17, Loader 13).
- Two module-local design kits (`CpitlUi.tsx`, `AsetsUi.tsx`) are near-copies of each other (same card, empty, shell, input and button class strings) and are the de-facto "shared kit" for CPITL (25 files) and ASETS (9 files).
- Raw HTML dominates: 73 files use native `<table>`, 62 use native `<select>`, 105 files hand-roll an empty state (`border-dashed` / "No ... found"), 32 use `window.confirm`, 33 files use their own `animate-spin` spinner (only 13 use `Loader`; 5 use lucide `Loader2`).
- Headless UI (`@headlessui/react ^1.7.17`) is in package.json but **imported by 0 files**. `react-select`, `react-datepicker`, `react-hook-form`, `yup`, `clsx`, `date-fns`, `html2canvas`, `file-saver` are also declared but **never imported** in `src`.
- **Portal rule violated.** 29 files contain `fixed inset-0`; only `common/Modal.tsx` and `common/Dialog/Dialog.tsx` use `createPortal`. The other 27 render inline overlays (the CLAUDE.md "white strip" bug class). Not all are modals (e.g. `layout/Header.tsx`, `CntrLanding.tsx`), but these are modal/drawer-style and un-portaled: `candidates/ImportModal`, `candidates/ReimportCompareModal`, `datesheets/{CreateModal,ImportModal,ScheduleModal}`, `subjects/ImportModal`, `actvt/{ClubEditModal,HouseEditModal}`, `asets/locations/LocationFormModal`, `common/ImageCropModal`, and pages `AnswerSheetDetails, AnswerSheets, Attendance, CBSECirculars, CentreGuidelines, DateSheets, DispatchSlip, Duties, Form66, SeatingPlan, Stickers, Students, Subjects, actvt/ActvtClubDetail, timetable/BellTimings`.
- Only 4 files declare `role="dialog"` (Dialog, Modal, subjects/ImportModal, pages/Subjects); 4 files `aria-modal`.

### 3.2 `components/common`

| Component | File | Props / variants | Used by (files; modules) |
|---|---|---|---|
| **Dialog** (compound: Dialog, DialogHeader, DialogBody, DialogFooter, useDialogContext, useDialog, useDialogStack) | `common/Dialog/*` (Dialog.tsx 332 lines, framer-motion) | `isOpen,onClose,title,description,icon,children`; `variant: default/success/warning/error/info` (left 4px border + header icon colour via success/warning/error/primary tokens); `size: xs/sm/md/lg/xl/full`; `position: center/top/bottom/left/right`; `animation: scale/slide-up/slide-down/slide-left/slide-right/fade`; `rounded: rounded/square/pill`; `backdropBlur: none/sm/md/lg`; `backdropOpacity`; `closeOnBackdrop/closeOnEscape/showCloseButton/closeButtonPosition(inside/outside)/preventBodyScroll/portal`; `draggable,maxHeight,minHeight,onBeforeClose,initialFocus,stackOrder,loading`; `actions: DialogAction[]` (`variant: primary/secondary/success/warning/error/outline/ghost`, `loading,disabled,icon`) mapped to global `.btn-*`; class overrides (`className, contentClassName, headerClassName, bodyClassName, footerClassName, overlayClassName`); `id`. DialogFooter `align: left/center/right/space-between` | **5**: `pages/Form66`, `pages/Duties`, `pages/CandidateDetail`, `components/onboarding/OnboardingWizard` (+ demo `pages/DialogShowcase`). Module: CNTR + onboarding only |
| **Dropdown** (Dropdown, VirtualList, useDropdown) | `common/Dropdown/*` (441 lines, uses `@tanstack/react-virtual`) | `options[{value,label,disabled,group}]`, `value/defaultValue/onChange`, `multiple`, `searchable/onSearch/filterFn`, async `onLoadMore/hasMore`, `size: sm/md/lg`, `placeholder,label,error,required,disabled,loading,clearable,maxHeight,position(auto/top/bottom),portal,virtualized,renderOption,emptyMessage`, `className,dropdownClassName,id,name` | **7**: `Teachers, Subjects, Candidates, AnswerSheets, ExmclCbseRegistration, components/candidates/*` (+ demo `DropdownExamples`). CNTR + EXMCL only |
| **Tabs** (Tabs, useTabs) | `common/Tabs/*` | `tabs[{id,label,icon,badge,color,disabled,ariaControls}]`, `activeTab,onChange`, `variant: pill/underline/enclosed`, `size: sm/md/lg`, `orientation`, `fullWidth`, `TabColor: blue/emerald/green/amber/yellow/rose/red/purple/gray/indigo/teal/orange` (active = solid `bg-{c}-500 text-white`), `ariaLabel`. Only `pill` seen in use (sm x4, md x1) | **8**: `Attendance, SeatingPlan, DateSheets, AnswerSheets, ExmclResult, Subjects, CentreGuidelines, Candidates`. CNTR/EXMCL/old ATTND. CPITL, ASETS, TMTBL, STAAF, ACTVT, TRNST all roll their own tabs |
| **Modal** | `common/Modal.tsx` (81 lines, portal, z-[100], Escape, body-lock) | `isOpen,onClose,title(string),children,size: sm(max-w-md)/md(lg)/lg(2xl)/xl(4xl)`; uses global `.card` classes; no footer slot | **17**: CPITL (8 pages + 5 components), `components/teachers/{TeacherModal,DeleteTeacherModal}`, `components/students/StudentModal`, `pages/HelpSupport`. Modules: CPITL, STDNT, Teachers, Help |
| **ExportModal** | `common/ExportModal.tsx` | `isOpen,onClose,title,onExport(filters,exportAll),onFetchPreview,filterConfig[{label,key,type: text/select/date/number,options,placeholder}]` | **1**: `pages/Teachers` |
| **ImageCropModal** | `common/ImageCropModal.tsx` (697 lines, `react-easy-crop`) | `imageSrc,open,title,hint,aspect,allowFreeCrop,defaultFreeCrop,fileNamePrefix,onCancel,onCropped(file,previewUrl)`. Not portaled | **6**: ACTVT (4 pages + `ClubEditModal`, `HouseEditModal`) |
| **Loader** | `common/Loader.tsx` | `size: sm/md/lg/xl`, `variant: spinner/dots/pulse/bounce`, `color: primary/secondary/success/warning/error/white`, `text`, `className` | **13**: `datesheets/*` (3), `candidates/*` (2), `subjects/ImportModal`, `Login, SeatingPlan, Remuneration, RemunerationDetails, DispatchSlip, CandidateDetail`, `App.tsx`. CNTR only |

Note: `common/Dialog/*.md`, `DialogExamples.tsx`, `common/Tabs/*.md` and the demo pages `DialogShowcase.tsx`/`DropdownExamples.tsx` are docs/demo code that ship in the bundle.

### 3.3 Module-local UI kits and reused feature components

| Component | File | Props / variants | Used by |
|---|---|---|---|
| **CpitlUi kit**: `CpitlBadge`, `CpitlPageShell`, `CpitlCard`, `CpitlEmpty`, `StatCard`, `ProgressBar`, `UsageBar`, `Field`, class strings `inputClass, btnPrimary, btnSecondary, btnGhost, tableHead`, helpers `inr, inrShort, fmtDate, errorMessage, MONTHS, FREQUENCY_LABELS, MODE_LABELS` | `components/cpitl/CpitlUi.tsx` | `CpitlBadge{status,label}` (13 keyed statuses, falls back to `draft`); `CpitlPageShell{title,subtitle,actions}`; `CpitlCard{title,actions,className}`; `CpitlEmpty{message,action}`; `StatCard{label,value,hint,icon(LucideIcon),tone: indigo/emerald/amber/rose/sky/violet}`; `ProgressBar` (collection: >=85 emerald, >=50 amber, else rose); `UsageBar` (spend: >100 rose, >=85 amber, else emerald) | **25** files: 18 CPITL pages + 7 CPITL components |
| **AsetsUi kit**: `AsetsStatusBadge`, `AsetsPageShell`, `AsetsCard`, `AsetsEmpty`, `AsetsQrPanel`, `inputClass, btnPrimary, btnSecondary` | `components/asets/AsetsUi.tsx` | `AsetsStatusBadge{status}` (uses `constants/asetsConstants.statusBadgeClass`, 10 keyed); `AsetsPageShell{title,subtitle,actions}`; `AsetsCard`; `AsetsEmpty{message}` | **9**: 7 `pages/asets/*` + 2 `components/asets/*` |
| CPITL feature components | `components/cpitl/{CollectPaymentModal,StudentLedgerPanel,QuickExpenseSheet,CategoryManager,StructureArchiveDialog,StaffSalaryCard,AttachmentInput,IconPicker}.tsx` | Feature-specific (modals built on `common/Modal`) | 12 CPITL page imports; `StaffSalaryCard` is the only CPITL piece embedded outside CPITL (per grep: staff area) |
| **DateSwitcher** | `components/attnd/DateSwitcher.tsx` | `value(YYYY-MM-DD), onChange`; prev/next chevrons, h-[34px] | **2** (both in `components/attnd`: staff + student daywise matrices) |
| **MonthSwitcher** | `components/attnd/MonthSwitcher.tsx` | `value(YYYY-MM), onChange` | **3**: `Attndboard, AttndStaffAttendance, AttndStudentAttendance` |
| **AttndModeSwitch** | `components/attnd/AttndModeSwitch.tsx` (+ `contexts/AttndMatrixModeContext`) | no props; toggles matrix mode | **1**: `components/layout` (header) |
| **AttndDaywiseMatrix / AttndStaffDaywiseMatrix** | `components/attnd/*` | page-specific data props; Present/Absent/Working summary chips (emerald/rose/slate) duplicated verbatim in 4 files | 1 each |
| **format-editor** (`FormatEditorShell`, `FormatToolbar`, `PageCanvas`, `CanvasOverlay`, `ToggleRow`, `formatRegistry`, `types`) | `components/format-editor/*` | Shell: `title,description,pageSize,orientation,pageHint,inspector,boundLayer,canvasItems,selectedCanvasId,...,style,onStyleChange,onAddText/Image/Rect/Line,...`; `FormatPageSize`, `FormatOrientation` types | **3 pages** (`ExmclAdmitCardFormat`, `ExmclAwardListFormat`, `ExmclReportCardFormat`) plus `hooks/useFormatCanvas`, 3 exmcl services, `components/exmcl`. EXMCL only |
| **RecordManager** | `components/records/RecordManager.tsx` | `fields[{key,label,type: text/textarea/select/date/number,options,required}], list, save, remove, cardTitle, cardMeta` (generic CRUD cards; also used for status via `select` fields) | **9**: 5 `pages/acdmc`, 2 `pages/mdcl`, 2 `pages/actvt` |
| **CentreRecordsUtilityPage** | `components/centre-records/CentreRecordsUtilityPage.tsx` | `title,description,summaryLabel,summaryValue,accentClasses,overview[],workflows[],outputs[]` | **3**: `Umcs, PwdInfo, Performas` (CNTR) |
| **CandidateTable** | `components/candidates/CandidateTable.tsx` | `candidates,loading,pagination,onPageChange,pageSizeOptions,pageSize,onPageSizeChange,sortField,sortDirection,onSortChange,noCard`. Contains the only reasonably generic pagination + sort-header UI, but it is candidate-typed | **1**: `pages/Candidates` |
| **CandidateFilters** | `components/candidates/CandidateFilters.tsx` | `filters,onFilterChange,stats` | **0 importers found by name grep** (likely dead or imported via relative path `./CandidateFilters`; verify) |
| Import/compare modals | `candidates/ImportModal`, `candidates/ReimportCompareModal`, `datesheets/ImportModal`, `subjects/ImportModal` (all `react-dropzone`, un-portaled), `datesheets/CreateModal`, `ScheduleModal` | Four near-duplicate import dialogs, no shared base | Candidates, DateSheets, Subjects pages |
| Teacher/Student modals | `components/teachers/{AddTeacherModal,EditTeacherModal,TeacherModal,DeleteTeacherModal}`, `components/students/StudentModal` | CRUD modals; `TeacherModal` also referenced by redux slice | Teachers / Students pages |
| **Dashboard widgets** | `components/dashboard/{DashboardHeader,KPISection,ExamOverview,ExamTimeline,OccupancyChart(recharts),RecentActivity,RoomAllotmentTable,TodaysExams,TodaysExamCard,TodaysExamControlPanel,UpcomingExams}` | `KPISection{cards: KPICard[]}`, `RecentActivity{items[{status: success/warning/info}]}` (uses hex `#10B981/#F59E0B/#1E40AF`), `OccupancyChart{used,remaining}`, `UpcomingExams{items}`, `ExamOverview{schoolsCount,functionariesCount,roomUsage}`, `DashboardHeader{dateStr,timeStr,notificationCount}` | **1**: `pages/Dashboard` (barrel `dashboard/index.ts`). Fully CNTR-specific |
| **exmcl** previews | `AdmitCardPreview, AwardListPreview, ReportCardPreview, ReportCardCanvasLayer, ExamRoomLayoutDesigner, CircularRichTextEditor{value,onChange,placeholder}, ResultEntryStatusPanel` | Feature-specific | EXMCL pages |
| **FAQAccordion** | `components/FAQAccordion.tsx` | `compact,searchQuery,showAll,onViewAll,limit` | **1**: `pages/HelpSupport` |
| **FeedbackForm / SupportForm** | `components/{FeedbackForm,SupportForm}.tsx` | `FeedbackForm{onSubmitted,embedded}`, `SupportForm{onSubmitted,initialModuleId,initialPageId,embedded}` | **1** each: `pages/HelpSupport` |
| Help components | `components/help/{HelpCentreHero,HelpContactPanel(HelpSystemStatus),HelpModuleDetail,HelpModuleGrid}` | `HelpSystemStatus{status: operational/down/other, message, updatedAt}` | `HelpSupport` |
| Layout | `components/layout/{Layout,Header,Sidebar,BillingBanner}` | `BillingBanner` reads `user.billing` (no props) | App shell |
| Auth | `components/auth/UniversalAuthBrand{compact,subtitle}` | | **2**: `Login, Signup` |
| Onboarding | `components/onboarding/{OnboardingWizard,ValidationReport}` | `ValidationReport` severity icons green/yellow/red | `Onboarding` page |
| Actvt local | `components/actvt/{ClubEditModal,HouseEditModal,HouseFlagFly}` | | ACTVT |

### 3.4 Do the "missing" shared components exist anywhere?

Searched filenames and component names (`DataTable|StatusBadge|EmptyState|PageHeader|Pagination|FilterBar|Badge|Chip|Pill|StatCard|Skeleton|Shell`).

| Concept | Shared version | Module-local versions (file) |
|---|---|---|
| **DataTable** | None | None as components. 73 files use raw `<table>`. Global CSS classes `.table .table-header .table-row .table-head .table-cell` exist in `styles/globals.css` but CPITL uses its own `tableHead` string, ASETS uses inline classes. Closest reusable: `candidates/CandidateTable.tsx` (typed to Candidate), `dashboard/RoomAllotmentTable.tsx` (+ `.css`), `TodaysExamControlPanel.SchoolTable`, `pages/Dashboard.TableSkeleton` (local) |
| **StatusBadge** | None. Global CSS `.badge .badge-default/-secondary/-success/-warning/-error/-outline` exists (`styles/globals.css`) but is used in only 6 spots (`TeacherDetail`, `StudentDetail`, + 4 `badge-secondary`/2 `badge-success` uses) | `CpitlBadge` (`components/cpitl/CpitlUi.tsx`), `AsetsStatusBadge` (`components/asets/AsetsUi.tsx`), `StatusBadge` ok/warning/error (`pages/timetable/Generate.tsx`, local), `StatusPill` (`pages/TrnstOverview.tsx`), `getStatusBadge` (`pages/CandidateDetail.tsx`), `STATUS_STYLES` version-status map (`pages/timetable/Generate.tsx`), `statusStyles` (`components/exmcl/ResultEntryStatusPanel.tsx`), `STATUS_TONE` (`pages/actvt/ActvtBoard.tsx`), `tone` map (`pages/actvt/ActvtStudentCouncil.tsx`), `HelpSystemStatus` (`components/help/HelpContactPanel.tsx`), `ClubLogoBadge`/`HouseLogoBadge` (logos, not status), `StatPill` (`ActvtHouses`), `StatChip` (`AlmniDirectory`), `CountTile` (`StaafOverview`) |
| **EmptyState** | None | `CpitlEmpty` (message+action), `AsetsEmpty` (message), 105 files with inline dashed/"No ... found" boxes (e.g. `RecordManager`, `StaafRecruitment` inline `<p>`, `TrnstVehicles`) |
| **PageHeader** | None | `CpitlPageShell` (CPITL), `AsetsPageShell` (ASETS), `dashboard/DashboardHeader`, `help/HelpCentreHero`, per-page hand-written headers elsewhere (TRNST/ACTVT use eyebrow `text-xs uppercase tracking-wide text-amber/emerald-600` style) |
| **Pagination** | None | `CandidateTable` (internal), plus ad-hoc "Showing X of Y"/page controls in `Students, Teachers, ExmclAdmitCards, ExmclAwardList, Candidates, CentreGuidelines, DateSheets, Subjects, asets/AsetsAssets, timetable/ClassWise` (11 files, each its own markup) |
| **FilterBar** | None | `candidates/CandidateFilters`, `ExportModal.filterConfig`, `Teachers` inline filter row, `AsetsAssets` inline selects; 36 files have an ad-hoc `placeholder="Search..."` input |
| **StatCard / KPI** | None (CPITL exports `StatCard`) | `StatCard` copies in `pages/StaafRecruitment` (l.276), `StaafOverview` (l.119), `Attndboard` (l.216), `TrnstOverview` (l.104), `ActvtBoard` (l.1254), `ActvtClubDetail` (l.91), `ActvtHouseDetail` (l.949); `components/cpitl/CpitlUi.StatCard`; `dashboard/KPISection`; `asets/AsetsLocations.SummaryCard`; `StudentInfo` inline config array. 9+ implementations. All take a different `tone` shape (tone key vs raw class string `bg-X-50 text-X-600`) |
| **Skeleton** | None | `pages/Dashboard.TableSkeleton`, inline `animate-pulse` in 26 files |
| **Card** | Global `.card .card-header .card-title .card-content .card-footer` | `CpitlCard`, `AsetsCard`, many inline `rounded-2xl border border-slate-200 bg-white p-5 shadow-sm` (slate family) vs `rounded-xl border border-gray-200 ... dark:bg-gray-800` (gray family) |

Two neutral-colour families are in simultaneous use: **slate** (CPITL, ASETS, TRNST, ACTVT, STAAF, STDNT info) and **gray** (CNTR, EXMCL, ATTND, Candidates, Teachers). Primary action colour is split between **indigo-600** (most newer modules) and **blue-600** (Form66, Duties, AnswerSheets, ExmclAdmitCards, ExmclAwardList) with global `.btn-primary` using the `primary` token.

### 3.5 Third-party UI libraries (import counts, files in `src`)

| Library | Version | Importing files | Notes |
|---|---|---|---|
| lucide-react | ^0.294.0 | **98** files (about 312 named-import tokens) | Primary icon set. Also `Loader2` in 5 files |
| react-hot-toast | ^2.4.1 | **96** files (`toast.error` x362, `toast.success` x170, `toast(` x5, `toast.custom` x1) | `<Toaster>` mounted in `main.tsx` (top-right, 4s, dark `#363636`) |
| react-router-dom | ^7.18.2 | 73 | |
| @tanstack/react-query | ^5 | 29 | |
| react-redux / @reduxjs/toolkit | 8 / 1.9 | 21 / 8 | |
| framer-motion | ^10.16 | **6**: `common/Dialog/Dialog.tsx`, `Dialog/animations.ts`, `AnswerSheetDetails`, `ForgotPassword`, `Login`, `SessionSelector` | |
| recharts | ^2.8 | **5**: `dashboard/OccupancyChart`, `asets/AsetsDashboard`, `cpitl/CpitlDashboard`, `CpitlElectricity`, `CpitlExpenses` | ASETS uses a hex palette `#4f46e5 #0ea5e9 #10b981 #f59e0b #f43f5e #8b5cf6 #64748b` |
| react-dropzone | ^14 | 4 (`candidates/ImportModal`, `ReimportCompareModal`, `datesheets/ImportModal`, `subjects/ImportModal`) | |
| react-pdf (+pdfjs) | ^10 | 6 | |
| jspdf | ^4 | 2 (`DateSheets`, `timetable/BellTimings`) | |
| react-easy-crop | ^6 | 1 (`ImageCropModal`) | |
| @tanstack/react-virtual | ^3 | 1 (`Dropdown/VirtualList`) | |
| @heroicons/react | ^2.0.18 | **1** (`pages/timetable/Generate.tsx`, `24/outline`) | Stray second icon set |
| axios | ^1 | 4 (services) | |
| **@headlessui/react** | ^1.7.17 | **0** | Declared, unused |
| react-select, react-datepicker, react-hook-form, @hookform/resolvers, yup, clsx, date-fns, html2canvas, file-saver | declared | **0** | Declared, unused (every form is hand-rolled `useState`) |
| Tailwind plugins `@tailwindcss/forms/typography/aspect-ratio` | | n/a | forms plugin affects raw inputs/checkboxes globally |

Tailwind theme tokens `primary/secondary/success/warning/error` exist (`tailwind.config`) and power `.btn-*`, `.badge-*`, Dialog, Loader; most feature code instead hardcodes raw palette classes (emerald/rose/amber/sky/violet/indigo/blue/green/red/yellow).

---


---
# SECTION 4 - Visual tokens

## 4.1 tailwind.config.js
- `darkMode: 'class'`; content `./index.html`, `./src/**/*.{js,ts,jsx,tsx}`; plugins: @tailwindcss/forms, typography, aspect-ratio.
- **Colours (extend)** - four custom 50-950 ramps that are copies of Tailwind defaults:
  - `primary` = Tailwind blue (50 #eff6ff, 100 #dbeafe, 200 #bfdbfe, 300 #93c5fd, 400 #60a5fa, 500 #3b82f6, 600 #2563eb, 700 #1d4ed8, 800 #1e40af, 900 #1e3a8a, 950 #172554)
  - `secondary` = Tailwind slate (50 #f8fafc ... 500 #64748b, 600 #475569, 700 #334155, 800 #1e293b, 900 #0f172a, 950 #020617)
  - `success` = Tailwind green (500 #22c55e, 600 #16a34a, 700 #15803d ...)
  - `warning` = Tailwind amber (500 #f59e0b, 600 #d97706, 700 #b45309 ...)
  - `error` = Tailwind red (500 #ef4444, 600 #dc2626, 700 #b91c1c ...)
  - Default Tailwind palette still fully available (heavily used).
- **Fonts**: `sans` = Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif; `mono` = JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace. Loaded from Google Fonts in index.html (Inter 300-700, JetBrains Mono 400-600). `<body class="font-sans antialiased">`. No serif/display face.
- **fontSize**: `2xs` 0.6875rem (11px), `3xs` 0.625rem (10px) - both defined but **0 uses** (code uses arbitrary `text-[11px]`/`text-[10px]` instead).
- **spacing**: 18 (4.5rem), 88 (22rem), 100 (25rem), 112 (28rem), 128 (32rem).
- **Radii**: none customised (default scale).
- **boxShadow**: `soft` (0 1px 3px rgba(0,0,0,.06)...), `medium`, `hard`, `glow` (0 0 0 3px rgba(59,130,246,.1)), `inner-soft`.
- **backdropBlur**: xs 2px. **screens**: `xs` 475px, `3xl` 1920px (plus defaults).
- **animation**: fade-in .5s, fade-out .5s, slide-in .3s (translateX -100% -> 0), slide-out .3s, bounce-gentle 2s infinite, pulse-slow 3s infinite. Keyframes fadeIn/fadeOut/slideIn/slideOut/bounceGentle.

## 4.2 src/styles/globals.css (368 lines) - imported globally
- `@layer base`: html smooth scroll; body `bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100`; global transition-timing-function cubic-bezier(.4,0,.2,1); WebKit scrollbar 1.5 units, thumb `gray-300/70` (dark `gray-600/70`); Firefox scrollbar-color rgba(203,213,225,.7) (dark .dark * rgba(100,116,139,.7)).
- `@layer components` (component classes): `.btn` (+`.btn-primary/-secondary/-success/-warning/-error/-outline/-ghost`; primary/success/warning/error use `bg-gradient-to-b from-X-500 to-X-600`), `.input` (h-10 rounded-lg, primary focus border + glow shadow-[0_0_0_3px_rgba(59,130,246,.1)]), `.input-error` (rgba(239,68,68,.1) glow), `.card` (+`-header/-title/-description/-content/-footer`; rounded-xl border-gray-100 shadow-sm, hover shadow-md), `.table`, `.table-header/-row/-head/-cell`, `.badge` (+ default/secondary/success/warning/error/outline; pill), `.spinner`, `.nav-link(.active)`, `.section-heading` (with trailing gradient line).
- `@layer utilities`: `.duties-table-scroll`, `.text-balance`, `.scrollbar-hide`, `.gradient-text` (primary-600 -> 400), `.glass` (backdrop-blur-xl bg-white/80 dark:bg-gray-900/80), `.shadow-smooth`, `.shadow-elegant`, `.shadow-premium`, `.glow-card`, `.animate-fade-in-up/-down`, `.animate-slide-in-right/-left`, `.animate-number-in`, `.animate-page-enter`, `.stagger-children` (6 children, 60ms steps).
- Keyframes: fadeInUp, fadeInDown, slideInRight, slideInLeft, numberIn, pageEnter. `@media print` (`.no-print`, `.print-break`).
- **Zero `:root` CSS custom properties; no design-token variables for colour/spacing.** Note `.btn*/.card/.input/.badge` component classes exist but most pages hand-roll classes instead (usage not counted here).

## 4.3 Every other CSS file (css vars = custom properties declared)
| File | Lines | Notes / CSS custom properties |
|---|---|---|
| styles/helpCentre.css | 103 | vars on `.help-centre-page`: `--hc-purple:#7c3aed; --hc-purple-light:#ede9fe; --hc-surface:#f8fafc` (19 rgba uses) |
| styles/houseFlagFly.css | 193 | vars on `.house-flag-fly`: `--flag-h:96px; --flag-w:144px; --pole-h:calc(var(--flag-h)+28px)` (flag wave animation; slate hexes #94a3b8/#e2e8f0/#cbd5e1/#64748b) |
| pages/CentreDetails.css | 649 | no vars; 45 hex + 51 rgba (largest CSS, bespoke styling) |
| pages/RoomAllocation.css | 284 | no vars; 43 hex |
| pages/SchoolHub.css | 282 | no vars; `.hub-card--*` gradient tiles (e.g. #f5576c -> #ff8a65); has BOTH `@media (prefers-color-scheme: dark)` AND `.dark .x` rules (only place mixing the two); 40 rgba |
| pages/CBSEPortals.css | 196 | no vars; `@media (prefers-color-scheme: dark)`; 20 rgba |
| pages/DispatchSlip.css | 126 | print-style slip, no vars |
| pages/SeatingPlan.css | 129 | no vars (e.g. #e5e7eb) |
| pages/DateSheets.css | 15 | no vars |
| components/dashboard/RoomAllotmentTable.css | 12 | `--room-allotment-used:0%; --room-allotment-remaining:0%` (set inline from JS) |
| components/dashboard/ExamTimeline.module.css | 25 | CSS module; `.segment` clip-path arrow; `.segmentDepth` rgba gradient |
Total custom properties in whole client/src: 8 (all component-local). No theme-level CSS variables exist, so the tenant brand colour is never exposed as a variable.

## 4.4 Hardcoded hex values (tsx + ts + css)
- Total hex literals: **1,519** (1,316 in .ts/.tsx, 203 in .css) across **56 files**. (3-digit pattern may include a few non-colour `#abc` ids.) 6-digit unique values are heavily slate/indigo/emerald Tailwind equivalents.
- Concentration (6-digit hex occurrences per file): timetable/ClassWise.tsx 174, timetable/TimetableClasses.tsx 141, Subjects.tsx 125, RoomAllocation.tsx 118, timetable/TimetableSubjects.tsx 100, timetable/TeacherWise.tsx 99, timetable/PeriodAllocation.tsx 86, CentreDetails.css 45, RoomAllocation.css 43, SchoolHub.css 19, CentreDetails.tsx 14, actvt/ActvtHouses.tsx 13, constants/houseColorMetadata.ts 13, timetable/Generate.tsx 10, actvt/ActvtSports.tsx 10. (These 7 pages hold ~840 of the 1,316 ts/tsx hexes - mostly inline `style={{}}` / colour maps / print HTML.)
- Top 26 hexes (count; main files):
| Hex | Count | Tailwind equiv | Main files |
|---|---|---|---|
| #94a3b8 | 78 | slate-400 | TimetableSubjects, TimetableClasses, houseFlagFly.css |
| #334155 | 75 | slate-700 | TimetableSubjects, TimetableClasses, TeacherWise |
| #e2e8f0 | 73 | slate-200 | TimetableSubjects, houseFlagFly.css, format-editor/types.ts |
| #6366f1 | 69 | indigo-500 | TrnstVehicles, TimetableSubjects, TimetableClasses |
| #1e293b | 55 | slate-800 | TimetableSubjects, TimetableClasses, TeacherWise |
| #f1f5f9 | 52 | slate-100 | TimetableSubjects, TimetableClasses, TeacherWise |
| #475569 | 52 | slate-600 | same timetable pages |
| #4f46e5 | 45 | indigo-600 | same timetable pages |
| #64748b | 42 | slate-500 | houseFlagFly.css, calendarDayMetadata.ts, TimetableSubjects |
| #cbd5e1 | 26 | slate-300 | format-editor/types.ts, houseFlagFly.css, TimetableClasses |
| #10b981 | 26 | emerald-500 | TrnstVehicles, TodaysExamCard, TimetableClasses |
| #eef2ff | 24 | indigo-50 | helpCentre.css, TimetableSubjects, TimetableClasses |
| #f8fafc | 23 | slate-50 | helpCentre.css, TimetableSubjects/Classes |
| #8b5cf6 | 22 | violet-500 | TrnstVehicles, TimetableClasses, TeacherWise |
| #ecfdf5 | 20 | emerald-50 | timetable pages |
| #ef4444 | 19 | red-500 | main.tsx (toast), TrnstVehicles, TimetableSubjects |
| #059669 | 19 | emerald-600 | timetable pages |
| #000000 | 17 | black | format-editor/types.ts, houseColorMetadata.ts, FormatToolbar |
| #e5e7eb | 15 | gray-200 | TimetableSubjects, Subjects.tsx, SeatingPlan.css |
| #a5b4fc | 14 | indigo-300 | timetable pages |
| #1e40af | 14 | blue-800 | UpcomingExams, TodaysExamCard, TimetableSubjects |
| #1a2536 | 14 | custom navy | timetable pages |
| #faf5ff | 13 | purple-50 | helpCentre.css, TimetableClasses, TeacherWise |
| #f59e0b | 13 | amber-500 | TrnstVehicles, TeacherWise, RoomAllotmentTable |
| #f0f4ff | 13 | custom | TimetableClasses, TeacherWise, Subjects |
| #fef3c7 | 12 | amber-100 | - |
| #f5f3ff | 12 | violet-50 | - |
| #92400e | 12 | amber-800 | - |
- `rgba(` **288** uses (CentreDetails.css 51, SchoolHub.css 40, CBSEPortals.css 20, helpCentre.css 19, Subjects.tsx 16, RoomAllocation.tsx 13); `rgb(` 2; `hsl(`/`hsla(` **0**.
- Also: `<meta name="theme-color" content="#07111f">` in index.html (dark navy, unrelated to in-app palette).

## 4.5 Tailwind colour-family class counts (bg/text/border/ring/from/to/via/divide/fill/stroke/outline/shadow/placeholder/accent/decoration + family[-shade]) in .ts/.tsx
| Family | Count | | Family | Count |
|---|---|---|---|---|
| gray | 4,664 | | rose | 220 |
| slate | 3,082 | | green | 215 |
| white | 1,875 | | violet | 173 |
| secondary (custom) | 1,337 | | yellow | 128 |
| blue | 682 | | error (custom) | 98 |
| indigo | 606 | | black | 98 |
| primary (custom) | 534 | | sky | 93 |
| emerald | 422 | | purple | 69 |
| amber | 329 | | cyan 52, orange 47, teal 24, pink 24 | |
| red | 255 | | **success (custom) 15, warning (custom) 7** | |
| | | | fuchsia 11, lime 4, stone 3, zinc 0, neutral 0 | |
Takeaway: the semantic tokens (primary/secondary/success/warning/error = 1,991 total) are used less than raw `gray`+`slate` (7,746). `secondary` and `slate` are the same colours (two names), and `gray` is a third neutral; success/warning are almost never used (green/emerald/amber/yellow are used instead). primary(blue) coexists with blue (682) + indigo (606), so brand blue vs indigo accent is not unified. Layout components (Sidebar/Header) use primary/secondary tokens; CPITL/ASETS pages lean on slate/indigo/emerald.

## 4.6 Typography
- Families: Inter (sans) everywhere; JetBrains Mono via `font-mono` (69 uses); `font-serif` 1; `font-sans` 0 (inherited from body). Print/format-editor/report-card previews use Arial/other families via inline style (`fontFamilyToCss`; 17 inline `fontFamily` refs in tsx).
- Font-size classes (.ts/.tsx): text-xs 1,195 | text-sm 1,532 | text-base 77 | text-lg 171 | text-xl 99 | text-2xl 70 | text-3xl 44 | text-4xl 15 | text-5xl 3 | text-6xl 0 | text-2xs/3xs 0.
- Arbitrary px sizes: **404** `text-[..px]`: 11px 233, 10px 122, 9px 19, 8px 13, 12px 12, 13px 2, 8.5px 2, 7px 1. Sidebar uses 13/12/11/10/9px; so effectively a de-facto 9-13px micro-scale beyond Tailwind's xs.
- Weights: font-semibold 1,211 | medium 848 | bold 315 | normal 11 | extrabold 7 | black 2 | light/thin 0. (Loaded Inter weights: 300-700.)

## 4.7 Radius
rounded-lg 516 | rounded-xl 463 | rounded-full 317 | rounded-2xl 202 | rounded-md 135 | rounded (plain) 125 | rounded-3xl 16 | rounded-sm 2 | rounded-none 1 | arbitrary `rounded-[..]` 89 (rounded-[28px] 60, [30px] 11, [24px] 10, [22px] 4, [26px] 1, [32px] 1 - mostly CPITL/ASETS hero cards). Dominant: lg (controls) / xl (cards) / 2xl (panels).

## 4.8 Shadows
shadow-sm 340 | shadow-md 31 | shadow-lg 30 | shadow-xl 27 | shadow (plain) 19 | shadow-2xl 14 | shadow-medium 8 (custom) | shadow-elegant 3 (custom CSS util) | shadow-inner 3 | shadow-hard 1 | arbitrary `shadow-[..]` 37 | shadow-soft/glow/smooth/premium 0. Custom shadows `soft/medium/hard/glow/inner-soft` in config mostly unused; `shadow-sm` dominates.

## 4.9 Dark mode coverage
- Config: `darkMode:'class'`. **There is no code anywhere in src that adds/removes the `dark` class** (grep for classList/documentElement.classList/matchMedia/theme toggle: none; only `useDialog.ts` touches documentElement for scrollbar width). Result: `dark:` variants (4,941 occurrences) are effectively inert unless a user manually sets `class="dark"` on `<html>`; no dark toggle in Header/Account menu; no `prefers-color-scheme` handling except 2 CSS files (SchoolHub.css, CBSEPortals.css) which respond to the OS setting independently - so those two can go dark while the rest of the app stays light. `<html>` has no class in index.html.
- Files: **135 of 228 .tsx files (59%) contain `dark:`** (components 59/86, pages 74/136, routes 1/1; contexts 0/3).
- Well-covered: pages/cpitl 17/18, pages/asets 7/7, components/cpitl 9/9, components/asets 4/4, components/attnd 5/5, components/dashboard 10/11, components/layout 4/4, candidates 4/4, datesheets 3/3, students 1/1, subjects 1/1.
- Lacking dark (0 `dark:`): all of **pages/actvt (0/13)**, **pages/acdmc (0/5)**, **pages/mdcl (0/2)**, **components/actvt (0/3)**, components/help (0/4), components/auth, centre-records, records; partial: pages/timetable 7/14 (TimetableClasses.tsx 1774 lines, TeacherWise.tsx 944 lines have none), components/exmcl 2/7, components/common 9/13, onboarding 1/2, teachers 2/4.
- 58 tsx files use bg-/text-/border- classes but have no `dark:`. Biggest: pages/Students.tsx (2186 lines), timetable/TimetableClasses (1774), actvt/ActvtBoard (1269), actvt/ActvtHouseDetail (959), timetable/TeacherWise (944), actvt/ActvtStudentCouncil (835), actvt/ActvtClubDetail (793), actvt/ActvtSports (744), common/ImageCropModal (697), exmcl/ReportCardPreview (604, print preview - ok), actvt/ActvtHouses (599), Login (545), ForgotPassword (492), TenantSignupChat (470), StudentProfile (381), TmtblLanding/StdntLanding/CntrLanding (marketing, 353-378), StaafRecruitment (365), TrnstVehicles (342), StudentInfo (341), SessionSelector (341), Stickers, Signup, Attndboard, SupportForm, AlmniDirectory, TrnstSelfStudents/Routes, StaafOverview. Full list: scratchpad/nodark.txt.

## 4.10 Tenant theme: useLogoBrandTheme + logoBrandColor
**utils/logoBrandColor.ts `extractLogoBrandTheme(logoUrl)` (async, cached)**
1. Cache: `sessionStorage['capabble-logo-brand:'+url]` (JSON of theme); returns cached if present.
2. Loads image with `crossOrigin='anonymous'` (needs CORS on logo host, else canvas is tainted -> catch -> returns null), draws into a 72x72 canvas, reads pixels.
3. Skips pixels with alpha < 140, lightness > 0.9 or < 0.08 (near white/black), HSV-ish saturation < 0.18 (greys).
4. Quantises survivors to buckets of 20 per channel (`round(c/20)*20`); each pixel adds weight `1 + saturation*2.2`; picks highest-scoring bucket as the brand colour (r,g,b). If no bucket qualifies -> null (no theming).
5. `buildTheme(r,g,b)` outputs `LogoBrandTheme`:
   - `primary` hex of the winner; `dark` = primary mixed 18% toward black; `light` = primary mixed 12% toward white (`adjustHexColor`)
   - `isDarkBackground` = WCAG relative luminance < 0.45
   - `textPrimary` = `#ffffff` if dark bg else `#0f172a`; `textMuted` = `rgba(255,255,255,0.72)` or `rgba(15,23,42,0.62)`; `ring` = `rgba(255,255,255,0.18)` or `rgba(15,23,42,0.08)`.
   - No contrast check beyond the 0.45 luminance threshold; no hue shifting; no scale (50-900) generation.
**hooks/useLogoBrandTheme.ts**: `useLogoBrandTheme(logoUrl)` -> state `LogoBrandTheme|null`; effect re-runs on URL change, cancel-flag guarded; empty URL -> null. Does NOT set any CSS variable or class on the document.
**Call sites (only one)**: components/layout/Sidebar.tsx:92 `useLogoBrandTheme(schoolProfile.logoUrl)` (`schoolProfile` from `useSchoolProfile`). `hasLogoBrandMenu = theme && logoUrl`.
**What consumes it (inline `style={}` only, no CSS variables, no Tailwind tokens):** only the sidebar footer account button + its dropdown header:
- Footer button (expanded only): `background: linear-gradient(135deg, primary 0%, dark 100%)`, `boxShadow: 0 10px 24px ${primary}33`, `borderColor: ring`; school name colour `textPrimary`, sub-lines + chevron `textMuted`; logo avatar sits on `bg-white/95 ring-white/70` tile (`onBrandBackground`).
- Dropdown header: `linear-gradient(135deg, light 0%, primary 100%)`, name `textPrimary`, details `textMuted`.
- Fallback (no logo / extraction failed): neutral `bg-secondary-50/50`, gradient `from-primary-500 to-indigo-600` initial-letter avatar.
**Stays un-themed**: everything else - active nav state (`primary-*` Tailwind blue), buttons, header, module switcher (hard-coded sky/primary), banners, charts, all pages, login/landing. `primary` Tailwind ramp is static blue; there is no tenant-level primary override. Collapsed sidebar footer also un-themed (only the logo avatar). Tenant theme is cached per-session only, not persisted/server-side, and not available to other components (no context/provider).

---
# SECTION 5 - Status vocabularies

Buckets: **S**=success, **W**=warning, **D**=danger, **I**=info, **N**=neutral, **P**=pending.
Dark-mode classes omitted unless notable. "Plain" = value shown as raw uncoloured text.

### 5.1 Attendance

| Domain | Value | Where shown | Current colour | Bucket |
|---|---|---|---|---|
| Attendance (student + staff daywise) | Present (counter chip) | `components/attnd/AttndDaywiseMatrix`, `AttndStaffDaywiseMatrix`, `pages/AttndStudentAttendance`, `AttndStaffAttendance` | `border-emerald-200 bg-emerald-50 text-emerald-700` | S |
| | Absent (counter chip) | same 4 files | `border-rose-200 bg-rose-50 text-rose-700` | D |
| | Working (counter) | same | `border-slate-200 bg-slate-50 text-slate-500/800` | N |
| | Absent (checkbox checked) | same | `text-rose-600 focus:ring-rose-500` | D |
| | Holiday / non-academic (column header, cells) | same; staff toggle button | header `bg-rose-50`, cell `bg-rose-50/80`, toggle `border-rose-200 bg-rose-50 text-rose-700` | N-ish (currently danger red) |
| | Working day / Academic (toggle) | `AttndStaffDaywiseMatrix`, section label `text-emerald-700` | `border-emerald-200 bg-emerald-50 text-emerald-700` | S |
| | Absent button selected (class attendance) | `pages/Attendance.tsx` l.463 | `bg-rose-500 border-rose-500 text-white` | D |
| | Present count text | `pages/Attendance.tsx` l.497 | `text-emerald-600` (>0) else `text-gray-400` | S / N |
| | Half day (stat hint only; staff + student) | `pages/Attndboard.tsx` | StatCard tone `bg-sky-50 text-sky-600` | I |
| | Student strength | `Attndboard` | `bg-violet-50 text-violet-600` | N |
| | Absence heat cell (by ratio: 0 / <0.4 / >=0.4 / >=0.7) | `Attndboard.tsx` l.34-38 | `bg-emerald-50 text-emerald-800`, `bg-rose-50 text-rose-800`, `bg-rose-200 text-rose-900`, `bg-rose-500 text-white` | S->D gradient |
| | Student profile "present" | `pages/StudentProfile` (`x.status === "present"`) | plain text/number | n/a |

Note: marks are only **present / absent (+ half day, holiday)**. There is no leave/late/excused vocabulary in the client. Marks are mutated via checkbox, not a status picker.

### 5.2 CPITL fees and finance (`components/cpitl/CpitlUi.tsx` `STATUS_STYLES`; every key = `ring-1 ring-inset` pill)

| Domain | Value | Where shown | Current colour | Bucket |
|---|---|---|---|---|
| Fee demand / ledger | `due` | `StudentLedgerPanel`, payroll "finalized" alias | `bg-sky-50 text-sky-700 ring-sky-600/20` | I |
| | `partial` | `StudentLedgerPanel` | `bg-amber-50 text-amber-700` | W |
| | `paid` | `StudentLedgerPanel`, `CpitlElectricity`, `CpitlPayroll*` | `bg-emerald-50 text-emerald-700` | S |
| | `waived` | `StudentLedgerPanel` (row also `opacity-50`) | `bg-violet-50 text-violet-700` | N |
| | `overdue` (derived: `isOverdue && !waived`; also unpaid + dueDate past for electricity) | `StudentLedgerPanel`, `CpitlElectricity`, `CpitlDashboard` (amount `text-rose-600`) | `bg-rose-50 text-rose-700` | D |
| Fee payment | `valid` | `CpitlPayments`, `StudentLedgerPanel` (icon `bg-emerald-50 text-emerald-600`, Receipt) | `bg-emerald-50 text-emerald-700` | S |
| | `cancelled` | `CpitlPayments` (row `text-slate-400`), `StudentLedgerPanel` (icon `bg-rose-50 text-rose-500`, amount struck through) | `bg-rose-50 text-rose-700` | D |
| Cheque | `pending` | `StudentLedgerPanel` ("Cheque pending") | `bg-amber-50 text-amber-700` | P |
| | `cleared` | same | `bg-emerald-50 text-emerald-700` | S |
| | `bounced` | same | `bg-rose-50 text-rose-700` | D |
| Fee structure | `draft` | `CpitlFeeStructures`, `CpitlFeeStructureDetail` | `bg-slate-100 text-slate-700` (also fallback for unknown) | N |
| | `active` | same | `bg-emerald-50 text-emerald-700` | S |
| | `archived` | same | `bg-slate-100 text-slate-500` | N |
| Payroll run | `draft` | `CpitlPayroll`, `CpitlPayrollRun` | `draft` slate | N / P |
| | `finalized` | same (mapped to `due`) | sky | I |
| | `paid` | same | emerald | S |
| Infra project (`INFRA_STATUS` in `CpitlInfra.tsx`) | `planned` -> "Planned" | `CpitlInfra`, `CpitlInfraDetail` | `draft` (slate) | N |
| | `in_progress` -> "In progress" | same | `due` (sky) | I |
| | `on_hold` -> "On hold" | same | `pending` (amber) | W |
| | `completed` -> "Completed" | same | `paid` (emerald) | S |
| | `cancelled` -> "Cancelled" | same | `cancelled` (rose) | D |
| Infra payment | `valid` / `void` | `CpitlInfraDetail` | `void`: row `opacity-50`, amount `line-through`, "Void: reason" text. No pill | S / D |
| Electricity bill | `unpaid` -> shows "Unpaid" (due/sky) or "Overdue" (rose); `paid` -> "Paid <date>" (emerald) | `CpitlElectricity` | as listed | I / D / S |
| Budget usage (`UsageBar`) | <85%, 85-100%, >100% | `CpitlBudgets` (+pct text `text-rose-600 font-semibold` when >100) | `bg-emerald-500`, `bg-amber-500`, `bg-rose-500` | S / W / D |
| Collection progress (`ProgressBar`) | <50, 50-84, >=85 | `CpitlCollection/Dashboard` | `bg-rose-500`, `bg-amber-500`, `bg-emerald-500` (opposite scale to UsageBar) | D / W / S |
| Net / balance | positive / negative | `CpitlDashboard` | `text-emerald-700` / `text-rose-600` | S / D |
| Balance cell | outstanding / "Paid up" | `CpitlCollection` | `text-amber-600` / `text-emerald-600` | W / S |
| Payment modes (`MODE_LABELS`) | cash, upi, cheque, dd, bank_transfer, card | `CollectPaymentModal` | selected chip indigo, otherwise slate | N |
| Fee frequency | one_time, monthly, quarterly, half_yearly, annual | CPITL | plain | N |

### 5.3 ASETS (`constants/asetsConstants.ts` `statusBadgeClass`; pill `ring-1 ring-inset`)

| Domain | Value | Where shown | Current colour | Bucket |
|---|---|---|---|---|
| Asset lifecycle status | `PROCURED` | `AsetsAssets, AsetsAssetDetail, AsetsDashboard, LocationDetailPanel` | `bg-violet-50 text-violet-700 ring-violet-200` | P |
| | `RECEIVED` | same (also shown after procurement receive) | `bg-cyan-50 text-cyan-700` | I |
| | `IN_STOCK` | same | `bg-sky-50 text-sky-700` | I |
| | `ALLOCATED` | same | `bg-indigo-50 text-indigo-700` | I |
| | `IN_USE` | same | `bg-emerald-50 text-emerald-700` | S |
| | `UNDER_MAINTENANCE` | same | `bg-amber-50 text-amber-700` | W |
| | `DAMAGED` | same | `bg-orange-50 text-orange-700` | W/D |
| | `LOST` | same | `bg-rose-50 text-rose-700` | D |
| | `RETIRED` | same | `bg-slate-100 text-slate-600` | N |
| | `DISPOSED` | same | `bg-slate-200 text-slate-500` | N |
| | unknown | | `bg-slate-50 text-slate-600` | N |
| Asset condition | New, Excellent, Good, Fair, Poor, Damaged, Beyond Repair | `AsetsAssets` table (plain), `AsetsDashboard` "Condition overview" (plain rows) | **no colour** | S..D (propose: New/Excellent/Good=S, Fair=W, Poor/Damaged=W/D, Beyond Repair=D) |
| Maintenance (`MAINTENANCE_STATUSES`) | Reported, Assigned, In Progress, Awaiting Parts, Completed, Closed | `AsetsWorkflowPages` (select + plain text) | **no colour** | P, I, I, W, S, N |
| Allocation | Active, Returned (Return button only when `Active`) | `AsetsWorkflowPages` | plain text in meta line | S / N |
| Transfer | Pending (Approve button), Completed | `AsetsWorkflowPages` | plain text | P / S |
| Disposal | Pending (Approve button), Approved | `AsetsWorkflowPages` | plain text | P / S |
| Disposal reasons | Beyond repair, Obsolete, Damaged, Lost, Sold, Donated, Scrapped, Other | form | plain | N |
| Procurement | Ordered/other, `Received` (renders `AsetsStatusBadge status="RECEIVED"` cyan) | `AsetsWorkflowPages` | cyan once received, plain text before | P / I |
| Audit | Open/In progress, `Closed` (disables editing) | `AsetsWorkflowPages` | plain text | P / N |
| Audit verify | Verified (and missing/extra variants) | `AsetsWorkflowPages` | plain | S |
| Location status | Active, Inactive | `LocationFormModal`, `LocationDetailPanel` Row (plain) | plain | S / N |
| Location type | Campus / Block / Floor / Room | `constants/locationConstants.LOCATION_TYPE_META` | indigo-100, violet-100, sky-100, emerald-100 (classification, not status) | N |
| Dashboard donut/bars palette | n/a | `AsetsDashboard` | hex `#4f46e5 #0ea5e9 #10b981 #f59e0b #f43f5e #8b5cf6 #64748b` | n/a |

### 5.4 CNTR / exam centre

| Domain | Value | Where shown | Current colour | Bucket |
|---|---|---|---|---|
| Candidate record status | `active` | `pages/CandidateDetail` `getStatusBadge` | `bg-green-50 text-green-700 ring-green-600/20` | S |
| | `inactive` | same | `bg-yellow-50 text-yellow-700` | W |
| | `graduated` | same | `bg-blue-50 text-blue-700` | I |
| | `suspended` | same | `bg-red-50 text-red-700` | D |
| Candidate class badge | `10th` | `CandidateTable`, `CandidateDetail`, `DispatchSlip`, `Stickers`, `SeatingPlan`, `DateSheets` | **`bg-green-50/100 text-green-700/800` in Candidates, CandidateDetail, DispatchSlip; `bg-emerald-100 text-emerald-800` in DateSheets, SeatingPlan** | N (category) |
| | `12th` | same | **`bg-purple-50/100 text-purple-700/800` in Candidates, CandidateDetail, DispatchSlip, Duties preview; `bg-violet-100 text-violet-800` in DateSheets, SeatingPlan, Stickers** | N (category) |
| Medium (subject code chip) | Hindi / English | `CandidateTable`, `CandidateDetail` | `bg-orange-50 text-orange-700` / `bg-blue-50 text-blue-700` | N (category) |
| Datesheet row timing | exam day = today | `DateSheets` (centre tab) | row `bg-green-50`, class badge as above | S |
| | next exam day | `DateSheets` | row `bg-yellow-50` | P/I |
| | 10th rows otherwise | `DateSheets` | `bg-emerald-50/30` | N |
| Exam date chips (`ExamTimeline`) | past | `components/dashboard/ExamTimeline` | `border-emerald-200 text-emerald-700 bg-emerald-50` | S (done) |
| | today | same | `border-blue-200 text-blue-700 bg-blue-50` (selected = `ring-amber-300`) | I |
| | future | same | `border-slate-200 text-slate-700 bg-slate-50` | N |
| Today's exam "live" pill | live today | `TodaysExamCard` | solid `bg-emerald-500 text-white` | S |
| Today's exam info tiles | time/rooms/notes/materials | `TodaysExamCard` | blue / sky / emerald / amber / violet tinted cards | N |
| Security status | CCTV etc. recorded / not recorded | `TodaysExamCard` | `CheckCircle2 text-emerald-500` / `AlertTriangle text-amber-500` | S / W |
| Control-panel totals match | matched / mismatched | `TodaysExamControlPanel` | `bg-emerald-50 text-emerald-700` / `bg-amber-50 text-amber-700` | S / W |
| Status Tracker | 100% / Ready for exam | `TodaysExamControlPanel` (hard-coded 100%) | emerald | S |
| Dashboard checklist | `Pending` vs anything else | `pages/Dashboard` (l.~480) | `bg-amber-50 text-amber-700` / `bg-emerald-50 text-emerald-700` pill | P / S |
| Recent activity | success / warning / info | `dashboard/RecentActivity` | `#10B981`, `#F59E0B`, `#1E40AF` hex on 10% bg | S / W / I |
| Re-import severity | `high` / `low` / (else) | `candidates/ReimportCompareModal` | `bg-red-100 text-red-800` / `bg-yellow-100 text-yellow-800` / `bg-green-100 text-green-800` | D / W / S |
| Re-import summary banner | affected / low / none | same | `bg-red-50`, `bg-yellow-50`, `bg-green-50` | D / W / S |
| Re-import diff | removed / added | same | `bg-red-100 text-red-800` / `bg-green-100 text-green-800` | D / S |
| Onboarding validation `overallStatus` | `errors` / `warnings` / ok | `OnboardingWizard`, `ValidationReport` | `bg-red-100 text-red-700` / `bg-yellow-100 text-yellow-700` / `bg-green-100 text-green-700` | D / W / S |
| Onboarding steps | complete / current / upcoming | `pages/Form66` processing steps | `bg-green-500` / `bg-blue-500` (spinner) / `bg-gray-300` | S / I / N |
| Form66 import result | success / error banner | `pages/Form66` | `bg-green-50 border-green-200` / `bg-red-50 border-red-200` | S / D |
| Form66 notices | info + issues | `Form66`, `ValidationReport` | `bg-blue-50 ...` info; `bg-yellow-50 border-yellow-200` issues | I / W |
| Duty eligibility (rooms eligible/total) | all / none / some | `pages/Duties` l.~2180 | `bg-green-100 text-green-700` / `bg-red-100 text-red-700` / `bg-amber-100 text-amber-700` | S / D / W |
| Duty assignment count vs max | under / equal / over (text) | `pages/Duties` l.~1500 | **red** when under, **green** when equal, **amber** when over | W(under)/S/W - note under=red here |
| Duty conflict row expanded | | `Duties` | `bg-amber-50/60` | W |
| Answer-sheet usage % | >100 / >90 / >75 / else (bar) | `AnswerSheetDetails` l.522 | `bg-red-600` / `bg-orange-500` / `bg-yellow-500` / `bg-green-500` | D / W / W / S |
| Answer-sheet usage % (text) | >90 / >75 / else | `AnswerSheetDetails` l.745 | `text-red-600` / `text-orange-600` / `text-green-600` | D / W / S |
| Answer-sheet counters | Received / Used / Discarded / Balance | `AnswerSheetDetails` | blue-600 / green-600 / red-600 / yellow-600 | I / S / D / W |
| Answer-sheet paper colour (`colour`) | blue / red / yellow / green | `AnswerSheets`, `AnswerSheetDetails.getColorStyles` | `bg-blue-100`, `bg-red-100`, `bg-yellow-100`, `bg-green-100` (this is physical paper colour, not status) | N (category) |
| Answer-sheet type | `32_pages`, `20_pages`, `40_graph`, other | `AnswerSheets` | blue / green / purple / gray `*-100` | N (category) |
| Answer-sheet tabs | tab labels via `Tabs` pill | `AnswerSheets` | active `bg-*-500` token | n/a |
| Dispatch | "Packed" copy; class rows 10 / 12 | `DispatchSlip` | row `bg-green-50` (10) / `bg-purple-50` (12); abs count `text-red-600`; counts `text-blue-600` | N / D |
| Form66 progress, import | see above | | | |

No formal "dispatch status" enum exists in the client (dispatch is a slip print/export flow).

### 5.5 EXMCL (internal exams)

| Domain | Value | Where shown | Current colour | Bucket |
|---|---|---|---|---|
| Result entry per subject/section (`ResultSubjectStatus`) | `complete` -> "Complete" | `components/exmcl/ResultEntryStatusPanel` | `bg-emerald-50 text-emerald-700 ring-emerald-100`, dot `bg-emerald-500` | S |
| | `partial` -> "In progress" | same | `bg-amber-50 text-amber-700`, dot amber | W / P |
| | `pending` -> "Pending" | same | `bg-slate-100 text-slate-600`, dot slate-400 | P / N |
| Result entry progress bar | | same | `from-indigo-500 to-violet-500` gradient | n/a |
| Result cell | absent token (`a/ab/abs/absent`) | `ExmclResult` | cell `bg-amber-50`, input `border-amber-300 bg-amber-50 text-amber-800` | W |
| Circular | `published` | `pages/ExmclCirculars` | `bg-emerald-100 text-emerald-700` | S |
| | `draft` | same | `bg-amber-100 text-amber-700` (CPITL & timetable draft = slate) | N/P (see conflicts) |
| Circular (ACDMC content) | `draft` / `published` | `pages/acdmc/Acdmc{Assignment,Homework,LessonPlan,Quiz}` via `RecordManager` select, shown plain in card meta | plain text | N / S |
| Admit card / award list / report card / exam / datesheet | no status enum in UI | `ExmclAdmitCards, ExmclAwardList, ExmclReportCard, ExmclExams, ExmclDatesheets` | only generic: link `text-blue-600`, primary buttons mix `bg-blue-600` / `bg-indigo-600`; ExmclDatesheets notices `text-amber-600` (warning), `bg-emerald-50` (success) | n/a |
| Format editor | toggles/ToggleRow | `format-editor/ToggleRow` | emerald/indigo switch (single class hit) | n/a |

### 5.6 TMTBL (timetable)

| Domain | Value | Where shown | Current colour | Bucket |
|---|---|---|---|---|
| Version status (`STATUS_STYLES`, `Generate.tsx` l.58) | `draft` | version table | `bg-slate-100 text-slate-600` | N |
| | `published` | same | `bg-emerald-100 text-emerald-700` | S |
| | `archived` | same | `bg-amber-100 text-amber-700` (CPITL archived = slate) | N (currently W) |
| Validation summary (`StatusBadge` local) | `error` / `warning` / `ok` | `Generate` | `bg-red-100 text-red-700` / `bg-amber-100 text-amber-700` / `bg-emerald-100 text-emerald-700` | D / W / S |
| Conflict count pill | >0 (amber) / 0 (emerald check text) | `Generate` | `bg-amber-100 text-amber-700` / `text-emerald-600` | W / S |
| Conflict list rows | error / warning | `Generate` | `bg-red-50 text-red-700` / `bg-amber-50 text-amber-700` | D / W |
| Generation result panels | success / warn / info | `Generate` | emerald / amber / blue tinted boxes | S / W / I |
| Substitution/entry `type` pill | any | `Generate` l.362 | `bg-amber-100 text-amber-700` | N (category, shown amber) |
| Class-wise fill | all filled / not | `ClassWise` (`cw-stat-green`/`cw-stat-amber` custom CSS) | green / amber pill | S / W |
| Teacher-wise stat | `tw-stat-amber`, `tw-bg-amber` gradient `#f59e0b -> #d97706` | `TeacherWise` custom CSS | amber | W |
| Substitution page | header band | `Substitution` | `bg-sky-50/40` | I |

### 5.7 STAAF / STDNT / Teachers

| Domain | Value | Where shown | Current colour | Bucket |
|---|---|---|---|---|
| Vacant post | `Open`, `On hold`, `Filled` | `pages/StaafRecruitment` | **plain text cells** (no colour) | S / W / N |
| Application (recruitment pipeline) | `Received`, `Shortlisted`, `Rejected` | same | plain text | P / S / D |
| Recruitment process steps | Vacant post -> Advertisement -> Application -> Entrance test -> Demo -> Interview -> Offer/joining | same | all steps `bg-blue-50 text-blue-700 ring-blue-100`; active tab `bg-blue-600` | N |
| Recruitment stat tones | | same | blue / amber / violet / emerald | n/a |
| Staff active | `isActive` true/false | `StaafOverview`, `Teachers` (filter "Active/Inactive"), `TeacherDetail` | `TeacherDetail`: global `.badge badge-success` / `badge-secondary` | S / N |
| Student active | `isActive` | `StudentDetail`: `.badge-success`/`.badge-secondary`; `StudentProfile` plain; `Students` form checkbox; `StudentInfo` "Active" stat `text-emerald-600` | S / N |
| Staff type colour (org chart) | pgt violet, tgt blue, prt emerald, sports-coach orange, admin amber, class-iv slate, drivers teal, conductors sky, security stone, other gray | `pages/StaafOrgStructure` | `from-X-50 to-white text-X-900 ring-X-100` | N (category) |
| Staff type options | Teaching, Sports Coach, Admin, Class IV, Drivers, Conductors, Security, Other | `utils/attndStaffTypes.ts`; also `STAAF_TYPE_OPTIONS` Teacher, Sports Coach, Admin, Class IV, Driver, Conductor, Security, Peon, Sweaper, Clerk | plain | N |
| Student import progress | normal / stopped early or failed > 0 | `pages/Students` bar | `bg-emerald-400` / `bg-amber-400` | S / W |
| Student page message | success / error | `Students` l.1128 | `border-emerald-200 bg-emerald-50 text-emerald-700` / `border-rose-200 bg-rose-50 text-rose-700` | S / D |
| StudentInfo stat tiles | Total / Active / Classes / Sections | `StudentInfo` | blue / emerald / violet / amber | n/a |

### 5.8 TRNST, ACTVT, MDCL, ALMNI

| Domain | Value | Where shown | Current colour | Bucket |
|---|---|---|---|---|
| Vehicle status (`VehicleStatus`) | `active` | `TrnstOverview.StatusPill` | `bg-emerald-50 text-emerald-700` | S |
| | `maintenance` | same | `bg-amber-50 text-amber-700` | W |
| | `inactive` | same (also fallback) | `bg-slate-100 text-slate-600` | N |
| Vehicle status on card | any | `TrnstVehicles` | **single colour** `bg-slate-50 text-slate-600` for all three (inconsistent with Overview) | - |
| Commute mode | Walk, Bicycle, Parent drop, Own vehicle, Other | `TrnstSelfStudents` | `bg-emerald-50 text-emerald-700` pill | N |
| Council post registration | `closed` | `ActvtStudentCouncil` `tone` map | `bg-slate-100 text-slate-600` | N |
| | `open` | same | `bg-emerald-50 text-emerald-700` | S |
| | `accepting` | same | `bg-amber-50 text-amber-700` | W/P |
| Council registration | `pending` | same | `bg-sky-50 text-sky-700` | P/I |
| | `accepted` | same | `bg-emerald-50 text-emerald-700` | S |
| | `rejected` | same | `bg-rose-50 text-rose-700` | D |
| Activity event | `planned` | `ActvtBoard` `STATUS_TONE` | `bg-sky-50 text-sky-700` | I/P |
| | `completed` | same | `bg-emerald-50 text-emerald-700` | S |
| | `cancelled` | same | `bg-rose-50 text-rose-700` | D |
| Sports event | `planned` default | `ActvtSports` | filter only | P |
| Certificates | `issued` | `ActvtCertificates` | not rendered as pill | S |
| Event type / category chips | activityType, category | `ActvtBoard` | `bg-slate-100 text-slate-600` | N |
| House colours | user-defined hex | `constants/houseColorMetadata`, `HouseFlagFly` | heading text black on light/yellow houses else white | n/a |
| Tours, functions, clubs, houses | no status enum | `ActvtTours, ActvtFunctions, ActvtClubs, ActvtHouses` | none (indigo links, rose "Remove") | n/a |
| MDCL cases / supplies | no status field | `MdclCases, MdclSupplies` | none | n/a |
| ALMNI directory | no status | `AlmniDirectory` | stat chips only (amber accents) | n/a |
| Help system status | `operational` / `down` / other | `HelpSystemStatus` | emerald / red-100 / amber-100 | S / D / W |

### 5.9 Billing / tenant / roles

| Domain | Value | Where shown | Current colour | Bucket |
|---|---|---|---|---|
| Billing access mode | `full` | `BillingBanner` (hidden), `Billing` page text | no banner | S |
| | `core_only` | `BillingBanner` | amber banner `bg-amber-50 border-amber-200 text-amber-800` | W |
| | `read_only` | same | red banner `bg-red-50 border-red-200 text-red-800` | D |
| Billing state | `past_due_grace` | same | amber banner | W |
| | `grandfathered` | same | amber banner | W/I |
| | `active` (default text) | `Billing` ("State: ...") | plain | S |
| Plan | `planCode` (e.g. trial), trial end date | `Billing` | plain text | n/a |
| Invoice status | free string | `Billing` table | **plain text** | S/P/D |
| Billing alert / success | red / emerald boxes | `Billing` | `border-red-200 bg-red-50 text-red-700` / `border-emerald-200 bg-emerald-50 text-emerald-700` | D / S |
| Roles | `admin`, `data_entry_operator` (types/auth.ts) | no role pill found in UI | n/a | n/a |
| Module registry | 12 ids: cntr, exmcl, timetable, stdnt, staaf, attnd, trnst, acdmc, actvt, mdcl, asets, cpitl | `constants/moduleRegistry.ts`, Sidebar | image icons, no status | n/a |
| Support / feedback submit | Submitted | `SupportForm`, `FeedbackForm` | plain | S |

### 5.10 Same meaning, different colour (conflict list)

| Meaning | Variants found (file) | Recommended |
|---|---|---|
| **Draft** | slate: CPITL `CpitlUi` (`draft`), TMTBL `Generate` STATUS_STYLES. **amber**: `ExmclCirculars` draft pill | neutral/pending, slate everywhere |
| **Published / Active / Paid / Completed / Complete / Valid / Cleared / Accepted / Open** | emerald (CPITL, ASETS IN_USE, TMTBL, TRNST, ACTVT, EXMCL result). **green** (Candidate `active`, DispatchSlip class 10, Duties full eligibility, Form66, ReimportCompareModal). Text `green-600` vs `emerald-600` mixed even on one screen (`AnswerSheetDetails`) | one `success` token (emerald) |
| **Active** | emerald-50 pill (CPITL structure, TRNST vehicle, ASETS location - plain); green-50 pill `ring-green-600/20` (`CandidateDetail`); `.badge-success` global (`TeacherDetail`, `StudentDetail`); plain checkbox label (`Students`) | one StatusBadge `active -> success` |
| **Inactive** | **yellow** (`CandidateDetail`), **slate** (TRNST, `badge-secondary`), plain "Inactive" (ASETS location) | neutral |
| **Archived** | slate-500 (CPITL), **amber** (TMTBL versions) | neutral |
| **Pending** | amber (CPITL `pending`, cheque, `On hold`); **slate** (EXMCL result `pending`, ResultEntryStatusPanel); **sky** (ACTVT council `pending`, CPITL `due`); **violet** (ASETS `PROCURED`); plain (ASETS transfer/disposal Pending, STAAF) | one `pending` bucket (amber or slate; decide) |
| **In progress** | amber (EXMCL `partial` "In progress"); sky (CPITL infra `in_progress`); plain (ASETS maintenance) | `info` (sky) |
| **Planned** | slate (CPITL infra), sky (ACTVT event `planned`) | neutral or info, pick one |
| **Overdue / Danger** | rose (CPITL, TRNST remove, ACTVT, ATTND absent); **red** (Candidate `suspended`, Duties, Form66, AnswerSheets, TMTBL errors, billing read_only, Help down); **orange** (ASETS DAMAGED, answer-sheet usage >90) | one `danger` (rose vs red decision) |
| **Warning** | amber everywhere, but **yellow** in Candidates banner, `CandidateDetail` inactive, ReimportCompareModal low, Onboarding warnings, Form66 issues, answer-sheet balance | amber only |
| **Info** | sky (CPITL due, ASETS IN_STOCK, ATTND half day), **blue** (graduated, Form66 info, today chip, ReimportCompareModal info), **indigo** (ASETS ALLOCATED), **cyan** (ASETS RECEIVED) | one `info` |
| **Cancelled / Void** | rose pill (`cancelled`, `bounced`) vs opacity/strike-through only (`void`) | danger pill + strike-through |
| **Waived** | violet (CPITL) | neutral (or keep as `special`) |
| **Holiday** | rose/red (ATTND headers) while "Working day" is emerald | neutral for holiday; red reads as danger |
| **Class 10 / Class 12** | 10 = green or emerald; 12 = purple or violet (4 different pairings across Candidates, DispatchSlip, DateSheets, SeatingPlan, Stickers) | single category pair |
| **Progress bars (high = good vs bad)** | `ProgressBar` high=emerald; `UsageBar` high=rose; answer-sheet usage high=red (consistent with UsageBar) | document the two scales |
| **Duty assignment vs max** | under = red, equal = green, over = amber (`Duties`) -- most apps treat over as danger and under as warning | rework |
| **Primary action colour** | indigo-600 (CPITL, ASETS, TRNST, ACTVT, STAAF, ATTND, EXMCL forms) vs blue-600 (Form66, Duties, AnswerSheets, ExmclAdmitCards, ExmclAwardList, ExmclReportCard links) vs `.btn-primary` (`primary` token) | one |
| **Status rendering style** | ring-1 inset pill (CPITL, ASETS, Candidates), plain `rounded-full` no-ring (TRNST, ACTVT), `border` pill (Dashboard, TodaysExamControlPanel), `rounded` square (ReimportCompareModal, Duties preview, TMTBL `type`), global `.badge` (Teacher/Student detail), plain text (STAAF, ASETS workflows, Billing invoice) | one component |
| **Badge sizing** | `px-2.5 py-0.5 text-xs font-semibold` (CPITL/ASETS), `px-2 py-0.5 text-[10px]` (ACTVT), `px-2.5 py-1 text-[11px]` (TRNST), `px-1.5 py-0.5 text-[10px] font-bold` (Duties) | one size scale |

### 5.11 Proposed semantic bucket summary (for the design-system token map)

| Bucket | Suggested token | Members to map into it |
|---|---|---|
| success | emerald | paid, valid, cleared, active, published, complete/completed, accepted, open(registration), IN_USE, operational, Present, verified, received(ASETS goods), resolved, matched, ok |
| warning | amber | partial, pending(cheque), on_hold, archived?(no), maintenance, partial(result entry), accepting, past_due_grace, core_only, DAMAGED/UNDER_MAINTENANCE, absent-token, conflict warnings, usage 75-100%, `inactive`(candidate) |
| danger | rose (or red; pick one) | overdue, cancelled, bounced, void, rejected, suspended, LOST, error, read_only, down, Absent, usage >100%, errors |
| info | sky | due, in_progress, planned, ALLOCATED, IN_STOCK, RECEIVED, finalized, today, graduated, pending(council), half-day |
| pending | amber-soft or slate | draft?, Reported/Assigned, PROCURED, Pending (transfer/disposal/recruitment), Received(application), Shortlisted?, pending(result) |
| neutral | slate | draft, archived, RETIRED, DISPOSED, closed, inactive(vehicle/staff), waived, Holiday, categories (class 10/12, medium, staff type, answer-sheet type) |

Open decisions for the design pass: (1) rose vs red for danger, (2) whether `draft` is neutral or pending, (3) whether `pending` is amber or slate, (4) whether `waived`/`void`/`holiday` need their own bucket, (5) category chips (class 10/12, medium, staff type, paper colour) should be a separate `category` palette not reusing status colours.

### 5.12 Data-source notes

- Most status enums come from services/types: `services/cpitlService.ts` (l.62, 117, 128, 134, 251, 351, 376, 466), `services/trnstService.ts` (VehicleStatus, CommuteMode), `constants/asetsConstants.ts`, `redux/slices` (Candidate/Teacher/Student), `types/auth.ts` (roles, billing snapshot).
- No server-driven status for ASETS allocation/transfer/disposal/audit/procurement was typed in the client; values are inferred from conditional checks in `pages/asets/AsetsWorkflowPages.tsx` (`Active`, `Pending`, `Closed`, `Received`).
- STAAF recruitment pipeline is **local-only sample data** persisted in `localStorage` (`staaf:recruitment`), not backed by API.
- Some status colours are in custom CSS rather than Tailwind: `pages/timetable/ClassWise.tsx` (`cw-stat-*`), `TeacherWise.tsx` (`tw-stat-*`, `tw-bg-amber`), `pages/DateSheets.css`, `RoomAllocation.css`, `SeatingPlan.css`, `components/dashboard/ExamTimeline.module.css`, `RoomAllotmentTable.css`, `styles/helpCentre.css`; these were not itemised.
- `components/candidates/CandidateFilters.tsx` showed 0 importers by name grep; confirm before treating as live code.

---
# SECTION 6: Mobile (<768px)

### 6.0 Headline
1. **There is no mobile shell.** The Sidebar has zero breakpoint classes, no drawer and no hamburger. No file in `src` uses `matchMedia`, `innerWidth` or a media-query hook. At 375px the expanded sidebar (default 208px, range 176 to 420px) leaves about 167px for content. Even pages marked "responsive" below inherit this problem until the user manually collapses the sidebar to 80px.
2. Only 8 page files have 15 or more responsive classes: the three landings, Signup, Students, Subjects, Dashboard and ActvtHouseDetail. Most module pages sit between 0 and 8.
3. Wide matrix pages (Duties, Attendance, AttndStaff/Student, RoomAllocation and the Timetable grids) are desktop-only.

### 6.1 Shell

| Component | Verdict | Evidence |
|---|---|---|
| `components/layout/Sidebar.tsx` | **Breaks** | Root `div` uses inline `style={{ width: currentSidebarWidth }}`. `grep 'sm:\|md:\|lg:'` returns nothing. It is permanently in the flex row (`Layout`: `relative flex h-screen`). There is no off-canvas drawer, no backdrop and no hamburger. Collapsed width is 80px, but collapse is user-toggled only and never auto-applied on small screens. Fly-out and click-away layers are `fixed ... style={{left: currentSidebarWidth}}` and so are also width-bound. Account and module-switcher menus are opened by click. |
| `components/layout/Layout.tsx` | **Breaks** | Sidebar and main are side by side. The resize handle uses `mousedown/mousemove/mouseup` only (no touch/pointer events, so it is a mouse-only affordance). Width persists in localStorage (176 to 420px). `main` is `flex-1 overflow-x-hidden overflow-y-auto`. Because of `overflow-x-hidden`, any page content wider than the viewport is clipped and cannot be scrolled unless the page has its own scroller. `h-screen` (100vh) misbehaves with iOS browser chrome. |
| `components/layout/Header.tsx` | **Partial** | `h-16` sticky `z-40`. Padding is `px-2 md:px-4`. The title is `truncate`. The right-hand cluster collapses: search is `hidden md:block`, the date label is `hidden lg:block`, and the session chip and info chip are `hidden sm:*`. The periods-per-week editor is `hidden md:flex`. Notification panel is `w-80` (320px, fits at 375). The sidebar toggle is the only nav affordance, and on mobile it only shrinks the sidebar to 80px. Header is not the problem; the missing drawer is. |
| `components/layout/BillingBanner.tsx` | Partial | No breakpoint classes (0 `sm:`/`md:`). |
| `components/common/Modal.tsx` | **OK at 375** | `createPortal` to `body`, `fixed inset-0 z-[100]`, `p-4`, `w-full`, `max-h-[calc(100vh-2rem)]`, inner scroll, Escape closes, body scroll lock. Minor issues: `size` only sets `max-w-*`, so it is fine on mobile. The close button is `absolute right-4 top-4` and the title has no right padding, so a long title can run under the X. It uses `100vh` instead of `dvh`. |
| `components/common/Dialog/Dialog.tsx` | **OK for center, broken for side sheets** | Portaled, `w-full`, `m-4`, `max-h-[90vh]`, `size=full` is `max-w-[95vw]`. For `position=left/right` it does `sizeClasses[size].replace('max-w','w')`, which yields `w-md`/`w-lg`/`w-xs`. These are not Tailwind 3 width utilities (`tailwind.config` adds only `18/88/100/112/128` spacing), so side drawers would get no width. Only `DialogExamples.tsx` uses `position="right"`, so there is no production impact today. |
| Custom inline overlays | **Mixed** | See 7.5. 37 inline `fixed inset-0` overlays. Most use `p-4` plus `items-center`, which is fine at 375. Several have fixed-width inner panels or multi-column forms (see per-page notes). |

### 6.2 Page verdicts

Legend: **R** = responsive, **P** = partial (usable with horizontal scroll or cramped), **B** = breaks (unusable or clipped under 768px).
"Stub" = under 40 lines, placeholder content only. Stubs are not testable and are likely fine.

#### Platform, auth and marketing pages

| Page | Verdict | Evidence |
|---|---|---|
| CntrLanding | R | resp 30, hero and sections have breakpoints. One `fixed inset-0 z-[60] p-4` modal (inline). |
| TmtblLanding | R | resp 28. |
| StdntLanding | R | resp 29. |
| Login | R | resp 10. `group-hover` only on a chevron animation (cosmetic). |
| Signup | R | resp 20. |
| ForgotPassword | R | resp 6, two columns collapse. |
| Pricing | R | resp 8. |
| HelpSupport | R | resp 12. |
| SessionSelector | R | resp 5. Hover is cosmetic. Pre-shell page, so no sidebar. |
| TenantSignupChat | P | resp 3, `grid-cols-2` with no base fallback in one place. |
| TenantSignupComplete | P | resp 0, 243 lines, simple stacked card. Likely fine but untested. |
| AccountSettings | R | resp 10. |
| Billing | P | resp 2. Table is in `overflow-x-auto`. |
| Dashboard | P | resp 16. 10 `<table class="w-full text-xs">`, wrapped via a `tableWrapper` const. Line 324 has `grid grid-cols-2 divide-x` holding two tables side by side with no breakpoint, so each gets about 80px on mobile. Floating widget `min-w-[230px]`. |
| SchoolHub | P | resp 0, own CSS with 1 `@media`. |
| Onboarding | stub | 10 lines (wrapper for OnboardingWizard). |
| PwdInfo, UndertakingForm, Umcs | P | Static documents, resp 0 to 1. Text flows. Probably fine. |
| DialogShowcase, DropdownExamples | dev | Demo pages (31 and 450 lines). Not product. |

#### CNTR (centre management)

| Page | Verdict | Evidence |
|---|---|---|
| Candidates | P | resp 9. Table and filters live in `components/candidates/CandidateTable.tsx` and `CandidateFilters.tsx`. Sort indicator is `opacity-0 group-hover` (hover-only affordance). |
| CandidateDetail | R | resp 11. Table is in `overflow-x-auto`. |
| Teachers | P | resp 10. Three `min-w-[240px]` stat cards, 1426 lines, table in `overflow-x-auto`. Sort arrows are hover-revealed. |
| TeacherDetail | R | resp 5. |
| Subjects | P | resp 21, own CSS with 2 `@media`, `.subj-table-wrap{overflow-x:auto}`. Two inline `fixed inset-0` import modals. |
| DateSheets | P | resp 14, tables in `overflow-x-auto`, one inline modal. |
| **Duties** | **B** | resp **0**, 2333 lines, 5 tables. Frozen sticky columns 4.5 + 13 + 5 + 7 rem = **29.5rem (472px)**, wider than a phone viewport, so the frozen columns cover the whole screen and the data columns can never scroll into view. Also `min-w-[1180px]` panel and hover rows (8 `group-hover`). One inline overlay. |
| SeatingPlan | P | resp 7, 14 tables. Main table is `min-w-[1100px]` inside `overflow-x-auto`. PDF-style fixed layout tables. One inline modal. |
| **RoomAllocation** | **B** | resp **0**, 1771 lines. Layout is driven by an embedded `<style>` block (`.ra-table`, `.ra-alloc-table`) with CSS-var sticky column widths and only a single `@media`. Seat-grid matrix. Unusable on a phone. |
| AnswerSheets | P (poor) | resp **1**, 2216 lines, 2 tables in `overflow-x-auto`, 44 `whitespace-nowrap`, 4 inline `fixed inset-0` modals, 20 `alert()` calls. Toolbars and filters have no breakpoints. |
| AnswerSheetDetails | P | resp 5. Four overflow wrappers, `w-[320px]`/`[180px]`/`[160px]`, 2 inline modals. |
| DispatchSlip | P | resp 8. `w-[80px]` x5, `w-[200px]`, 4 overflow wrappers, own CSS has 1 `@media`, 2 inline modals. |
| Form66 | P | resp 8. 3 tables, `overflow` x2, tooltip is `opacity-0 group-hover` (hover-only, `pointer-events-none`). One inline overlay plus the shared Modal. |
| CentreDetails | P | resp 0 in Tailwind, but its own CSS has `@media (max-width:768px)` and `640px` (padding, hero wrap, grid collapse). `.cd-table-wrapper` wraps the table. |
| CentreGuidelines | P | resp 4, 2 tables in overflow wrappers, one inline modal, `alert()` x5. |
| Remuneration | P | resp **0**, 3 tables in overflow wrappers, 38 `whitespace-nowrap`. Tables scroll, but filter and toolbars are unresponsive. |
| RemunerationDetails | P | resp 4. |
| Stickers | P | resp 0, one table in overflow wrapper, inline overlay `fixed inset-0 z-50`. Sticker-sheet preview is fixed layout. |
| CBSECirculars | P | resp 4, inline modal. |
| CBSEPortals | P | resp 0, own CSS has 1 `@media`. |
| Performas | P | resp 0, 198 lines, simple list. |
| Activities | P | resp 3, 2 tables in overflow wrappers. |

#### ATTND (attendance)

| Page | Verdict | Evidence |
|---|---|---|
| **Attendance** | **B** | resp **0**, 609 lines. Daywise matrix with sticky columns `w-[180px]`, `[140px]`, `[90px]` x2, `[48px]`. Inline `fixed inset-0` overlay. |
| **AttndStudentAttendance** | **B** | resp 3. Same matrix. Sticky left columns 44 + 96 + 180 + ... with `stickyOffset = 320` hard-coded in JS (line 144). About 320px of a 375px viewport is frozen. `sticky top-0 z-40` header. |
| **AttndStaffAttendance** | **B** | Identical pattern, resp 3. |
| Attndboard | R | resp 8, table in overflow wrapper. |

#### STDNT (students)

| Page | Verdict | Evidence |
|---|---|---|
| Students | P | resp 20, 2186 lines. Two inline `fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3` modals (the edit modal conditionally wraps itself, line 1318). `w-[108px]` filter inputs, a `min-w-[280px]` custom toast (line 970). Table in `overflow-x-auto`. |
| StudentDetail | R | resp 5. |
| StudentInfo | P | resp 3. `grid-cols-2`/`3` without a base fallback. Table in `overflow-x-auto`. |
| StudentProfile | P | resp 5. `min-w-[230px]`/`[220px]`. |

#### EXMCL (internal exams)

| Page | Verdict | Evidence |
|---|---|---|
| ExmclExams | P | resp **0**, one table in `overflow-x-auto`, `min-w-[180px]` and `[120px]` controls. |
| ExmclDatesheets | P | resp 2, 2 tables in `overflow-x-auto`. |
| ExmclSubjects | P | resp 3. |
| ExmclCbseRegistration | P | resp 9, sticky header. |
| ExmclAdmitCards | P | resp 3, `min-w-[220px]`, `[140px]`. |
| ExmclAwardList | P | resp 3. |
| ExmclReportCard | P | resp 3, 16 `whitespace-nowrap`, table in overflow wrapper. |
| **ExmclResult** | **B** | resp 4, 955 lines. Marks-entry grid uses `<col className="w-[88px]/[40px]/[64px]/[168px]...">` (12 fixed px values). Per-row delete button is `invisible group-hover:visible` (line 761), so it is unreachable on touch. |
| ExmclCirculars | P/B | resp **0**. `min-w-[180px]`, `[150px]` x2. Rich-text editor, 372 lines. |
| **ExmclAdmitCardFormat, ExmclAwardListFormat, ExmclReportCardFormat** | **B** | resp 1, 1, 0. These are WYSIWYG canvas editors (`components/format-editor/*`, A4 canvas, toolbar). They are inherently desktop and mouse-driven. |
| ExmclMarksDistribution, ExmclQuestionPapers, ExmclSyllabus | stub | 18 to 19 lines. |

#### CPITL (finance)

`CpitlPageShell` is the best mobile base in the app: `p-4 sm:p-6`, header stacks `flex-col sm:flex-row`, actions wrap.

| Page | Verdict | Evidence |
|---|---|---|
| CpitlCollection | R | resp 7. |
| CpitlExpenses | R | resp 6. |
| CpitlFeeStructures | R | resp 6. Hover is only cosmetic. |
| CpitlInfra | R | resp 6. |
| CpitlInfraDetail | R | resp 5. |
| CpitlBudgets | R | resp 3, table in `overflow-x-auto`. |
| CpitlPayments | R | resp 3, table in `overflow-x-auto`. |
| CpitlDashboard | P | resp 4, 2 tables in overflow wrappers, `grid-cols-2`/`3` blocks. |
| CpitlElectricity | P | resp 4, `grid-cols-2` x3 without breakpoint. |
| CpitlFeeStructureDetail | P | resp 9, 2 tables, `grid-cols-2` x3. |
| CpitlFeeSlips | P | resp 1. |
| CpitlFuel | P | resp **1**, 3 tables in overflow wrappers, `grid-cols-2` x2. |
| CpitlPayroll | P | resp 0, table in overflow wrapper. |
| CpitlPayrollRun | P | resp 2, table in overflow wrapper. |
| **CpitlSalary** | **B (form rows)** | resp 5. Component rows use `grid grid-cols-12` with no breakpoint (lines 148, 180, 427). 12-column rows with inputs compress to unusable widths at 375px. |
| **CpitlSettings** | **B (form rows)** | resp 7. `grid grid-cols-12 items-end` (line 229), same problem. |
| **CpitlOperating** | **P, hover-only** | resp 1. The row "Void" button is `invisible ... group-hover:visible` (line 192), so touch users cannot void an expense. The FAB is `fixed bottom-6 right-6`. |
| CpitlStudentLedger | stub | 11 lines. |

#### ASETS

`AsetsPageShell` uses `p-6` (no `sm:` shrink) and stacks the header on mobile.

| Page | Verdict | Evidence |
|---|---|---|
| AsetsDashboard | R | resp 8. |
| AsetsAssets | R | resp 5, table in `overflow-x-auto`. |
| AsetsAssetDetail | R | resp 6. |
| AsetsLocationDetail | R | resp 4. |
| AsetsLocations | P | resp 4. Tree plus detail panel side by side (`w-80`-class panel). The tree row actions are `opacity-0 group-hover:opacity-100` (LocationTree.tsx:110), hover-only. Inline modal in `LocationFormModal`. |
| AsetsWorkflowPages (Allocations, Transfers, Maintenance, Stock, Audits, Procurement, Disposal, Reports, Settings) | R | resp 9, table in `overflow-x-auto`. |
| AsetsSimplePages | P | resp 1. |

#### ACTVT (activities)

| Page | Verdict | Evidence |
|---|---|---|
| ActvtBoard | R | resp 14, `grid-cols-7` mini calendar is fine on a phone, `grid sm:grid-cols-2 xl:grid-cols-4`. |
| ActvtSports | R | resp 13, but `min-w-[180px]`/`[160px]` filter controls. |
| ActvtStudentProfile | R | resp 6. |
| ActvtClubDetail | P | resp 14. Table is `w-full table-fixed` inside `overflow-hidden` with no x-scroll, so the columns are squeezed. |
| ActvtHouseDetail | P | resp 19, same `table-fixed` plus `overflow-hidden` pattern. |
| ActvtClubs, ActvtHouses | P | resp 5, fixed `min-w-[180px]` etc. Inline modal in `ClubEditModal`/`HouseEditModal`. |
| ActvtHouseRanking | P | resp 2. |
| ActvtStudentCouncil | P | resp 3, 835 lines. |
| ActvtCertificates | P | resp 2. |
| ActvtCalendar, ActvtFunctions, ActvtTours | stub | 1 to 27 lines. |

#### TMTBL (timetable)

Timetable grids use embedded `<style>` blocks (`cw-`, `tw-`, `tc-`, `ts-`, `pa-` prefixes) with 0 Tailwind responsive classes and at most one `@media` each.

| Page | Verdict | Evidence |
|---|---|---|
| **ClassWise** | **B** | resp 0, 1990 lines. Class by day-period grid. Only `@media (max-width:900px)` (line 1363). Table scrolls via CSS `overflow-x:auto`. Mouse-driven. `alert()` x4. |
| **TeacherWise** | **B** | resp 0, 944 lines. Fixed `width:260px` summary, wide grid. |
| **TimetableClasses** | **B** | resp 0, 1774 lines, 2 tables, `.tc-table-wrap{overflow-x:auto}`. |
| **TimetableSubjects** | **B** | resp 0, 1956 lines, 3 tables, `min-w-[240px]` x3, 1 overflow wrapper. |
| PeriodAllocation | B/P | resp 0, `.pa-table` with min-widths 48 to 70px. |
| Substitution | P | resp 0, `min-w-[920px]` table in `overflow-x-auto`. |
| Departments | P | resp 3, `min-w-[920px]` and `[980px]` tables in overflow wrappers, `w-[320px]` panel. |
| BellTimings | P | resp 3, 933 lines, inline overlay. |
| Generate | P | resp 6, 2 tables in overflow wrappers. |
| SubjectAllocation | P | resp 4. |
| Formats | P | resp 1. |
| TimetableTeachers | stub-ish | 98 lines. |
| TimetablePagePlaceholder | R | resp 4. |
| Versions | stub | 5 lines. |

#### STAAF, TRNST, ALMNI, ACDMC, MDCL

| Page | Verdict | Evidence |
|---|---|---|
| StaafOverview | R | resp 7. |
| StaafRecruitment | P | resp 5, table in overflow wrapper. |
| StaafOrgStructure | P | resp 2. `min-w-[760px]` chart inside `overflow-x-auto` (scrolls), `grid-cols-2 xl:grid-cols-4`. |
| Staff | P | resp 2, table in `overflow-x-auto`. |
| StaafStaffGroup, StaafStaffMembers | stub | 21 to 25 lines. |
| TrnstOverview | P | resp 3. |
| TrnstRoutes | P | resp 1, `grid-cols-2` with no base. |
| TrnstSelfStudents | P | resp 2, `w-[220px]`. |
| TrnstVehicles | P | resp 3, fixed `[180]`/`[140]`/`[120]`/`[100]px`. |
| AlmniDirectory | R | resp 7. |
| AcdmcAssignment, AcdmcCurriculum, AcdmcHomework, AcdmcLessonPlan, AcdmcQuiz, MdclCases, MdclSupplies | stub | 27 to 37 lines each, no responsive classes (placeholders). |

### 6.3 Worst offenders (priority order)

1. **Shell: Sidebar and Layout.** No drawer, no auto-collapse, no hamburger, no touch resize. This blocks every authenticated page on a phone. Fix once and the whole app improves.
2. **Duties.** 472px of frozen sticky columns, `min-w-[1180px]` panel, 0 responsive classes, 2333 lines.
3. **Attendance, AttndStudentAttendance, AttndStaffAttendance.** Hard-coded 320px sticky offset, 0 to 3 responsive classes.
4. **RoomAllocation.** Seat-grid matrix, 1771 lines of custom CSS, 0 responsive classes.
5. **Timetable grids:** ClassWise, TeacherWise, TimetableClasses, TimetableSubjects, PeriodAllocation. Each is 0 responsive classes, 670 to 1990 lines.
6. **ExmclResult** (fixed-pixel `<col>` grid, hover-only delete) and the **three Exmcl format editors** (A4 canvas editors).
7. **CpitlSalary and CpitlSettings:** unbreakable `grid-cols-12` form rows. **CpitlOperating:** touch cannot reach the hover-only Void button.
8. **AnswerSheets (2216 lines, resp 1) and Students (2186 lines).** Large pages with inline overlays, fixed-px controls and unresponsive toolbars.
9. **ActvtClubDetail and ActvtHouseDetail:** `table-fixed` inside `overflow-hidden` with no scroll.
10. **Dashboard:** side-by-side two-table `grid-cols-2` block.

Hover-only interactions (touch-unreachable): CpitlOperating:192 (void), ExmclResult:761 (delete), LocationTree.tsx:110 (row actions), Teachers/Candidates sort arrows (`opacity-0 group-hover`), Form66:1024 (tooltip), ActvtClubDetail:449 (image overlay), StudentModal:303 (photo hover).

---

# SECTION 7: Inconsistencies

Module key (by file naming): CNTR = Candidates, Teachers, Subjects, DateSheets, Duties, SeatingPlan, RoomAllocation, AnswerSheets, Dispatch, Form66, Remuneration and related (47 files with components). TMTBL = `pages/timetable` (14). STDNT (6). EXMCL (22). CPITL (27). ASETS (11). ACTVT (17). ATTND (9). STAAF (6). TRNST (4). ALMNI (1). ACDMC (5 stubs). MDCL (2 stubs). PLATFORM = auth, landing, dashboard, help (34).

### 7.0 Summary matrix (counts by module, `pages` + `components` excluding `components/common` and `components/layout`)

| Metric | CNTR | TMTBL | STDNT | EXMCL | CPITL | ASETS | ACTVT | ATTND | STAAF | TRNST | PLATFORM |
|---|---|---|---|---|---|---|---|---|---|---|---|
| raw `<table` | 47 | 13 | 2 | 14 | 16 | 4 | 5 | 6 | 2 | 0 | 15 |
| `toast.*` calls | 103 | 44 | 1 | 79 | 87 | 59 | 98 | 21 | 0 | 20 | 21 |
| `alert(` | 34 | 11 | 3 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| `window.confirm(` | 5 | 7 | 0 | 2 | 8 | 2 | 11 | 0 | 0 | 3 | 0 |
| `fixed inset-0` inline overlays | 28 | 1 | 2 | 0 | 0 | 1 | 3 | 1 | 0 | 0 | 1 |
| shared `Modal` imports | 1 | 0 | 0 | 0 | 13 | 0 | 0 | 0 | 0 | 0 | 1 |
| shared `Dialog` imports | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `<Loader` | 20 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| `animate-pulse` skeleton | 6 | 0 | 0 | 1 | 18 | 0 | 0 | 0 | 0 | 0 | 9 |
| hand-rolled `animate-spin` | 36 | 5 | 3 | 4 | 1 | 0 | 0 | 5 | 0 | 0 | 6 |
| native `<select` | 22 | 22 | 9 | 22 | 34 | 40 | 24 | 4 | 0 | 9 | 0 |
| shared `common/Dropdown` | 8 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| shared `common/Tabs` | 8 | 0 | 0 | 1 | 0 | 0 | 0 | 2 | 0 | 0 | 0 |
| `btn-primary` global class | 26 | 21 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| solid indigo button | 3 | 3 | 0 | 8 | 2 | 5 | 24 | 5 | 0 | 3 | 2 |
| solid slate/gray-900 button | 77 | 2 | 3 | 19 | 0 | 0 | 2 | 9 | 0 | 0 | 8 |
| solid blue-600/700 button | 29 | 0 | 6 | 6 | 0 | 0 | 0 | 1 | 2 | 0 | 10 |
| pagination/page-size code | yes (Teachers, Candidates, Subjects, DateSheets, Duties) | BellTimings only | Students | ExmclAdmitCards/Circulars/AwardList | none | none | none | none | none | none | none |
| sortable columns | Teachers, Candidates, DateSheets, AnswerSheets, Subjects | no | no | no | no | no | ActvtClubDetail, HouseDetail | no | no | no | no |

### 7.1 Tables
- **No shared table component.** There are 73 files containing `<table` (about 114 `<thead>` tags). There is no `DataTable`. The only reusable table pieces are `components/candidates/CandidateTable.tsx` (candidates only) and `RoomAllotmentTable.tsx` (dashboard).
- **Dead global styles.** `styles/globals.css` defines `.table`, `.table-header`, `.table-row`, `.table-head`, `.table-cell` (hover `bg-primary-50/40`, `h-12 px-4`). **Zero files use them.** `CpitlUi.tsx` exports its own `tableHead` string and the CPITL pages use it, so CPITL does follow a local convention.
- **Header styling:** 114 `<thead>` tags, **27 distinct** `className` strings. Examples: `bg-gray-50 dark:bg-gray-700` (Candidates, Teachers), `bg-slate-50 dark:bg-slate-900/40` (CPITL `tableHead`), `bg-secondary-50 text-secondary-700 dark:bg-secondary-900` (a few pages), `bg-gray-50/80 ... sticky top-0 backdrop-blur`, `bg-gray-50/50 dark:bg-gray-900/50`. Three base palettes (gray, slate, secondary).
- **Cell density:** `px-6 py-4` (146 uses, Remuneration/AnswerSheets/Teachers), `px-3 py-2.5` (142, CPITL/ASETS), `px-3 py-2` (120), `px-6 py-3` (72), `px-4 py-3` (62), `px-5 py-2.5` (55), `px-1 py-2` (45). That is seven or more densities.
- **Row hover:** `hover:bg-slate-50` (70, CPITL/ACTVT/ASETS), `hover:bg-gray-50` (64, CNTR), `hover:bg-secondary-50` (30), `hover:bg-gray-100`, `hover:bg-slate-100`. Only 19 files put a hover class on `<tr>` at all.
- **Sticky headers:** 21 files, with mixed z-index (`z-[1]`, `z-10`, `z-20`, `z-40`). Typical z is `z-40`, which collides with the app header (`z-40`). Candidates: `Attendance`, `AttndStudentAttendance` (`sticky top-0 z-40`), `Duties`, `Students`, `Teachers`, `ExmclResult`. CPITL/ASETS lists have none.
- **Pagination:** only CNTR pages (Teachers, Candidates, Subjects, DateSheets, Duties), Students, and some EXMCL pages have it. CPITL (16 tables), ASETS, ACTVT, ATTND, STAAF and TRNST render unbounded lists.
- **Sorting:** only 8 files (Teachers, Candidates, DateSheets, AnswerSheets, Subjects, CandidateTable, ActvtClubDetail, ActvtHouseDetail). Indicators differ (Teachers `text-[8px]` arrows with `opacity-0 group-hover`).
- **Empty row:** 102 `colSpan` usages. Each table builds its own "No X found" row.

### 7.2 Filters and search
- **No shared filter bar.** 36 files hold a search input and use 12 or more different placeholders ("Search students" x3, "Search...", "Search", "Search subjects...", "Search name or emp. ID", "Search name or adm. no", "Search locations...", "Search teacher...").
- **Pattern differences:** CNTR Candidates uses a dedicated `CandidateFilters` component. Students inlines filters (`w-[108px]` date inputs). ATTND uses a `DateSwitcher`/`MonthSwitcher`/`AttndModeSwitch` trio. ASETS/CPITL use `inputClass` constants. ACTVT hand-builds `min-w-[180px]` selects.
- **Select style:** 22 native `<select>` in CNTR and 22 in TMTBL, 22 EXMCL, 34 CPITL, 40 ASETS, 24 ACTVT. The shared `common/Dropdown` is used in only **2 modules** (CNTR 8, EXMCL 2). `TrnstSelfStudents`, `AlmniDirectory` and others use native selects.
- **Input styles:** `inputClass` constant (CPITL + ASETS, 39 files, rounded-xl, focus indigo), global `.input` class (51 files), and ad-hoc `rounded-md`/`rounded-lg`/`rounded-xl` strings. Focus ring colors are split almost evenly: `focus:ring-blue` 47, `focus:ring-indigo` 57, `focus:ring-primary` 45.
- **Form labels:** `Field` helper exists only in CPITL (`CpitlUi.tsx`, 14 pages plus 5 components). Other modules use raw `<label>` markup, so label spacing and hint text vary.

### 7.3 Page headers, titles, breadcrumbs, action placement
- **Header-driven titles.** `Header.tsx` derives `pageTitle`/`pageSubtitle`/back button from a route-to-title `switch` per module (`staaf`, `actvt`, `cpitl`...). That is the app's canonical page title.
- **Pages then repeat their own heading** in 3 different ways:
  - `CpitlPageShell` (18 files) and `AsetsPageShell` (7 files) render `h2 text-lg font-semibold`, with subtitle and an actions slot to the right (`sm:flex-row sm:items-end sm:justify-between`). The two shells are near-copies but differ: CPITL has `p-4 sm:p-6`, ASETS has `p-6`. CPITL also hides the heading block when there is no title.
  - CNTR/EXMCL/TMTBL/ACTVT pages use bare `<div className="p-6">` (**47 pages**) or `p-6 max-w-7xl mx-auto` (6), `p-8 max-w-[1600px] mx-auto min-h-screen bg-gray-50/50` (5, Exmcl), `px-8 pb-8 pt-3 max-w-[1600px]` (4), `p-4 md:p-6 max-w-[1600px]` (2). Five distinct page container paddings.
  - Detail pages (`CandidateDetail`, `TeacherDetail`, `StudentDetail`, `ActvtClubDetail`, `ActvtHouseDetail`, `ActvtStudentProfile`) use `<h1>`. Only 22 page files have an `<h1>` and most of those are landing and auth pages.
- **Title sizes** among `h1`/`h2` in pages: `text-lg` x44, `text-xl` x25, `text-2xl` x25, `text-3xl` x17.
- **Breadcrumbs:** effectively none. `breadcrumb` appears only twice (ASETS). Back navigation relies on `Header` `showBackButton`/`backTo`.
- **Action button placement:** CPITL/ASETS put actions top-right in `PageShell`. CNTR puts them inline in a toolbar row beside filters. Students uses a floating or segmented bar. CpitlOperating adds a `fixed bottom-6 right-6` FAB. No convention.

### 7.4 Empty and loading states
- **Loading:**
  - Shared `Loader` (`common/Loader.tsx`, variants spinner/dots/pulse/bounce) is used in **18 files**, almost all CNTR (20 uses) plus Login, SessionSelector, TenantSignupComplete and the import modals. Never in TMTBL, STDNT, EXMCL, CPITL, ASETS, ACTVT, ATTND, STAAF, TRNST.
  - **Hand-rolled spinners:** 33 files with `animate-spin`. Four identical `animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600` and three `h-10 w-10` copies.
  - **Skeletons:** `animate-pulse` x18 in CPITL (e.g. `CpitlDashboard.tsx:76`, `CpitlPayroll.tsx:63`), x9 in PLATFORM (dashboard widgets), x6 CNTR, x1 EXMCL. None elsewhere.
  - **Plain text:** "Loading...", "Loading activities...", "Loading vehicles...", "Loading students..." across ASETS, ACTVT, TRNST, ATTND, EXMCL, TMTBL. Loading text is the dominant pattern outside CNTR/CPITL.
- **Empty states:** ASETS `AsetsEmpty` and CPITL `CpitlEmpty` (dashed-border box, CPITL adds an action slot), used in 76 places. All other modules write inline ("No X found/yet/available", 37 CNTR, 28 ACTVT, 16 EXMCL). Wrappers differ: `p-10 text-center text-sm text-gray-500` (12), `py-10 text-center text-slate-500` (6), `px-5 py-8 text-secondary-500` (6). The three palettes (gray/slate/secondary) recur.
- **Error banners:** `bg-red-50`/`bg-error-50` inline in 20 files (CNTR 12, TMTBL 7, PLATFORM 6). CPITL and ASETS use toasts instead.

### 7.5 Modals and dialogs (CLAUDE.md rule: shared Modal/Dialog, never inline `fixed inset-0`)
- **Shared usage:** `common/Modal` imported by 15 files (CPITL 13, one in `components/teachers`, one in help) and `common/Dialog` by 5 files (`Duties`, `Form66`, `CandidateDetail`, `HelpSupport`, `DialogShowcase`).
- **Violations:** grep `fixed inset-0` outside `components/common` returns **38 occurrences in 26 files**. 37 are inline modal/overlay code (the 38th, `Header.tsx:861`, is a transparent `z-30` click-away for notifications, which is fine). Only three files use `createPortal` besides the shared components (Sidebar for click-aways, Dropdown). **None of the 26 offenders portals to `document.body`.** This reproduces the white-strip-over-header bug the rule describes, because the sticky header is `z-40` and these overlays are `z-50` or `z-[60]` inside the `animate-page-enter` stacking context.

| File | Count | Notes |
|---|---|---|
| `pages/AnswerSheets.tsx` | 4 | `z-[60]`, `z-50` variants |
| `pages/Students.tsx` | 2 | `z-50 overflow-y-auto bg-black/40 p-3` (edit modal conditionally wraps itself) |
| `pages/DispatchSlip.tsx` | 2 | |
| `pages/AnswerSheetDetails.tsx` | 2 | |
| `pages/Subjects.tsx` | 2 | |
| `components/candidates/ImportModal.tsx` | 2 | |
| `components/candidates/ReimportCompareModal.tsx` | 2 | |
| `components/datesheets/ImportModal.tsx` | 2 | |
| `components/datesheets/CreateModal.tsx` | 2 | |
| `components/datesheets/ScheduleModal.tsx` | 2 | |
| `pages/Duties.tsx` | 1 | `z-[60]` (the same file also imports shared Dialog, so it mixes both) |
| `pages/Form66.tsx` | 1 | `z-[60]` (also imports shared Dialog) |
| `pages/Attendance.tsx` | 1 | `z-[60]` |
| `pages/SeatingPlan.tsx` | 1 | `z-[60]` |
| `pages/CentreGuidelines.tsx` | 1 | |
| `pages/DateSheets.tsx` | 1 | |
| `pages/Stickers.tsx` | 1 | `z-50 bg-slate-950/35` |
| `pages/CBSECirculars.tsx` | 1 | `z-50 bg-black/40` |
| `pages/CntrLanding.tsx` | 1 | `z-[60]` |
| `pages/actvt/ActvtClubDetail.tsx` | 1 | |
| `components/actvt/ClubEditModal.tsx` | 1 | |
| `components/actvt/HouseEditModal.tsx` | 1 | |
| `components/asets/locations/LocationFormModal.tsx` | 1 | |
| `components/subjects/ImportModal.tsx` | 1 | `bg-gray-500 bg-opacity-75` |
| `pages/timetable/BellTimings.tsx` | 1 | |

- **CPITL is the only module that follows the rule** (13 shared-Modal imports, no inline overlays). ASETS and ACTVT edit modals are inline.
- Backdrop recipes among offenders: `bg-black/60 p-4 z-[60]` (9), `bg-gray-500 bg-opacity-75` (6, old Tailwind UI recipe), `z-50 overflow-y-auto` (6), `bg-black bg-opacity-50 z-50` (4), `z-50 ... p-4 sm:p-6 animate-fade-in` (3), and others. About 12 distinct recipes.
- Other overlays: Dashboard floating card `fixed bottom-6 right-6 z-50`, and the CpitlOperating FAB `z-30`.

### 7.6 Buttons and inputs
- **Primary button has four implementations:**
  1. Global `.btn .btn-primary` (gradient `primary-500 to primary-600`): 59 uses in 24 files (CNTR 26, TMTBL 21, STDNT 2, rest in dashboard/shared components).
  2. Constant `btnPrimary` in `CpitlUi.tsx` and `AsetsUi.tsx` (`rounded-xl bg-indigo-600 ... hover:bg-indigo-700`). Note the CPITL one adds `inline-flex gap-1.5`, the ASETS one does not.
  3. Hand-written `bg-gray-900`/`slate-900`/`bg-slate-800` solid buttons (CNTR 77, EXMCL 19, ATTND 9, PLATFORM 8).
  4. Hand-written `bg-blue-600/700` (CNTR 29, PLATFORM 10, STDNT 6, EXMCL 6) or `bg-primary-600` (CNTR 10, PLATFORM 7).
  - ACTVT (24) and EXMCL (8) use indigo directly, so **primary color is blue (theme `primary`), indigo, or near-black depending on the module**. The `primary` token is itself blue (`#eff6ff` family) so indigo modules visibly differ from the brand.
- **Corner radius on buttons:** `rounded-xl` (12 of 28 matched), `rounded-md` (8), `rounded-full` (5), `rounded` (2), `rounded-lg` (1). Global `.btn` is `rounded-lg`.
- **Badges:** `CpitlBadge` (pill, `ring-1 ring-inset`, 13-status map), `AsetsStatusBadge` (own `statusBadgeClass`), global `.badge` (used in only 2 places), and ad-hoc pill spans (`rounded-full px-2 py-0.5` x10, `px-2.5 py-0.5` x6, `px-3 py-1` x5). `rounded-full ... text-xs` pills appear in all modules (CNTR 36, ACTVT 17, STDNT 16, PLATFORM 27).
- **Dropdown:** native `<select>` dominates (about 180 uses overall). Shared `Dropdown` is limited to CNTR and EXMCL.

### 7.7 Toasts and confirmations
- **Toasts:** `react-hot-toast` is the only toast library (93 files, about 535 `toast.*` calls, one `<Toaster>` in `main.tsx`). That is consistent. Exceptions: `Students.tsx:968` uses `toast.custom` with a hand-built `min-w-[280px] bg-slate-800` card (the only STDNT toast), and STDNT reports most errors via `alert` or inline.
- **`window.alert`:** 50 calls in 10 files. `AnswerSheets.tsx` 20, `CentreGuidelines.tsx` 5, `TimetableClasses.tsx` 4, `ClassWise.tsx` 4, `Teachers.tsx` 4, `RoomAllocation.tsx` 4, `TimetableSubjects.tsx` 3, `components/students/StudentModal.tsx` 3, `Activities.tsx` 2, `DropdownExamples.tsx` 1 (demo). Only CNTR, TMTBL, STDNT and `Activities` (ACTVT) use them. CPITL, ASETS, EXMCL, ATTND and TRNST use toasts only.
- **`window.confirm`:** 36 real calls in 28 files (plus 1 in `DialogExamples`, and 2 mentions in README). Heaviest: `TimetableClasses` 3, `ActvtBoard` 3, `TimetableSubjects` 2, `CpitlPayrollRun` 2, `ActvtSports` 2. Present in every module with destructive actions: CPITL (8), ACTVT (11), TMTBL (7), CNTR (5), TRNST (3), EXMCL (2), ASETS (2). **No shared confirm dialog** (`ConfirmDialog`/`useConfirm` do not exist), although the `Dialog` README documents a confirm variant. CNTR has dedicated `DeleteTeacherModal`; CPITL has `StructureArchiveDialog`.
- **`window.prompt`:** 7 calls (AnswerSheets x2 for quantity input, and "Reason:" prompts for void/remove in `CpitlElectricity:346`, `CpitlOperating:93`, `CpitlFuel:280`, `CpitlInfraDetail:130`, `StudentLedgerPanel:227`). Finance flows capture an audit reason through a browser prompt.

### 7.8 Cards, tabs, forms, dates, currency
- **Cards:** global `.card` class (CNTR 96, TMTBL 29, PLATFORM 25, STDNT 14). CPITL and ASETS ignore it and define `CpitlCard`/`AsetsCard` (`rounded-2xl border-slate-200 p-5 shadow-sm`; CPITL has title and actions slots). Everyone else uses ad-hoc `rounded-xl`/`rounded-2xl` + border recipes (about 425 matches) vs `rounded-lg` + border (about 240), with 3 border palettes (gray, slate, secondary).
- **Stat cards:** `StatCard` (CPITL only), `KPISection` (dashboard), inline cards in Teachers (`min-w-[240px]`), ACTVT, ASETS dashboard.
- **Tabs:** shared `common/Tabs` used in 8 CNTR pages (Candidates, DateSheets, Subjects, AnswerSheets, SeatingPlan, CentreGuidelines, Attendance), `ExmclResult`, and `Attendance`. Hand-rolled `border-b-2` tabs in 12 files (Duties, StudentProfile, Attendance (both), DateSheets, AnswerSheetDetails, AnswerSheets, CpitlFuel, CpitlFeeStructureDetail, CpitlSalary, ReimportCompareModal, OnboardingWizard, ValidationReport). Several files use both. TMTBL has its own tab strips in embedded CSS.
- **Form layouts:** CPITL = `Field` helper plus `grid-cols-*` (`grid-cols-12` rows in Salary/Settings). ASETS = `inputClass` with raw labels. CNTR = `.input`/raw markup inside shared Modal, with a few hand-built forms in inline overlays. TMTBL = embedded `<style>` CSS forms. EXMCL = `rounded-lg border-gray-300 focus:ring-indigo` inline strings. `RecordManager` (STAAF/TRNST/ALMNI generic CRUD) has its own mini-form.
- **Date formatting:** `date-fns` is in `package.json` but has **zero imports**. All formatting is hand-rolled. `toLocaleDateString` is called with `'en-GB'` (5 plain plus 2 with options plus 1), `'en-IN'` (4 with `{day:'2-digit',month:'short',year:'numeric'}`, 2 weekday), `'en-US'` (3 weekday, 1 full) and no locale at all (2), so the same date can render as `06/10/2026` (en-GB), `06 Oct 2026` (en-IN) or `10/6/2026` (default/en-US). There are **17 local date-helper definitions** (e.g. `Students.tsx:108`, `Attendance.tsx:93`, `SeatingPlan.tsx:287`, `AnswerSheets.tsx:346`, `CandidateDetail.tsx:170`, `StudentDetail.tsx:98`, `TeacherDetail.tsx:88`, `ExmclAdmitCards.tsx:30`, `ExmclAwardList.tsx:32`, `ExmclCirculars.tsx:51`, `Generate.tsx:63`, `CandidateTable.tsx:81`, `TodaysExams.tsx:195`, `Stickers.tsx:5`, `UndertakingForm.tsx:5`, plus `CpitlUi.fmtDate`). `src/utils` has no shared date or currency formatter. ASETS has its own `fmtDate` (8 uses).
- **Currency formatting:** CPITL has the best helper (`inr`, `inrShort` in `CpitlUi.tsx`, `en-IN` grouping, 42 `₹` literals). Remuneration (`Remuneration.tsx:64`), `RemunerationDetails.tsx:22` and `Billing.tsx:6` each define their own `formatCurrency`. ASETS has 7 `formatCurrency`-style calls. `toLocaleString('en-IN')` is used 12 times (10 in CPITL), bare `toLocaleString()` 11 times (locale-dependent grouping), `Intl.NumberFormat` once (PLATFORM), and `Rs` appears in 1 CNTR string while `₹` appears in 14 files. Indian grouping is therefore not guaranteed outside CPITL.

### 7.9 Top fixes by leverage
1. Mobile shell (drawer plus auto-collapse): one change fixes the biggest mobile blocker.
2. Move the 26 inline-overlay files onto `common/Modal` or `common/Dialog` (Section 7.5 list). This fixes the white-strip bug and gives a consistent mobile layout.
3. Add a shared `ConfirmDialog` and `PromptDialog`. Replaces 36 `window.confirm`, 50 `alert` and 7 `window.prompt` calls.
4. Extract `PageShell`/`Card`/`Empty`/`Field`/`Badge`/`inputClass`/`btnPrimary` from `CpitlUi.tsx` into `components/common` and use them everywhere. Pick one primary color.
5. Add `utils/format.ts` (`formatDate`, `formatCurrency` using `en-IN`), delete the 17 local helpers and the unused `date-fns` dependency or adopt it.
6. Build one `DataTable` (sticky header, density, hover, sort, pagination, empty state, mobile card mode) and delete the unused `.table-*` classes.
