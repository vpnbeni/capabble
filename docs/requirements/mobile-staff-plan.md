# Capabble mobile app — staff side plan

Status: approved 25 Oct 2026; slices 1–8 and the notifications list are built and live on the `preview`
channel (see "Done" at the end). Leave stays out until a leave feature exists. Extends Phase 2 (teacher) and Phase 3
(principal glance) of `mobile-app-plan.md`. References: design system `ScreensStaff`, `MobileScreens`
(roll call) and the "Mobile coverage" page.

## What the code really supports (checked)

- `/auth/me` already returns `teacher` (the staff record linked to the login), `permissions` with
  scope, and `featureToggles`. The app's `User` type just doesn't read the last two yet.
- **Student attendance is daily, Present / Absent only** (`PUT /attnd/students`, one class-section
  and date per call, saves the whole register). A `StudentAttendanceDay` record says the register was
  taken. No Leave or Half day marks for students, so the roll call has P and A, not P/A/L.
- **"My periods" has no endpoint.** The web shows the whole grid (`/timetable/state`, versions).
  `modules/timetable/teacherSchedule.js` already works out a teacher's periods for a date (used by
  appointments) but only returns busy times, not class and subject.
- **Substitutions are not stored.** The web Substitution page has no API behind it.
- **There is no leave module** (no leave types, balances or requests, web or server).
- **There is no messaging.** Staff get in-app notifications (`/api/notifications`) and push.
- Approvals that exist today: calendar events from teachers (`clndr.events.approve`,
  `POST /calendar/events/:id/approve|reject`) and meeting requests from families
  (`/appnt/appointments/:id/confirm|decline`).
- `expo-file-system` is installed, so an offline queue needs no new native module. Detecting
  offline uses failed requests (no `netinfo`), so it ships as an update, not a new build.

## Module by module

**Now** = in the first slices. **Later** = phone-worthy, after the first slices. **Web only** =
desk work; More → "Open on the website" row links to the page.

| Module | Web pages | Phone | Why |
|---|---|---|---|
| Home | `Home.tsx` | **Now**: Today tab | The teacher's day and the principal's glance replace it |
| Notifications | `Notifications.tsx` | **Now**: bell in the nav bar, list, tap opens the thing | The API exists; push already lands here |
| Attendance · students | `AttndStudentAttendance` | **Now**: roll call, offline queue | The one daily phone task of a teacher |
| Attendance · board | `Attndboard` | **Now** (principal): present today, registers not marked | Read on the move |
| Attendance · staff | `AttndStaffAttendance` | **Done**: one day at a time | Office marks staff absences once a day |
| Timetable · mine | (no web page: `TeacherWise` is the admin view) | **Now**: Today's periods + week | Daily look-up |
| Timetable · setup | Generate, allocations, bell timings, versions, formats, departments, classes, subjects, teachers | Web only | Heavy setup |
| Timetable · substitutions | `Substitution` | Later | No data on the server yet; needs the web feature first |
| Calendar | `CalendarPage`, `CalendarEvents` | **Now**: my calendar, reply, create event for approval; principal approves | Daily, and approvals are a phone task |
| Calendar · audiences, responses, school days | `CalendarEvents` (manage), `settings/SchoolDays` | Web only (responses list: later) | Setup |
| Appointments | `AppntPages` | **Now** as host: today's meetings, confirm / decline, check in, done, no-show, private notes, my weekly hours. Later: front-desk booking and walk-ins | Hosts are away from the desk when a parent arrives |
| Appointments · settings, reports | `AppntPages` | Web only | Setup |
| Students | `Students`, `StudentDetail`, `StudentProfile` | **Now**: my classes → roster → student (call a guardian); principal: search all | Look-ups on the move. Respects "own classes only" |
| Students · records | `StudentInfo`, imports, ID cards, stickers, alumni | Web only | Data entry and printing |
| Staff | `StaafStaffMembers`, `StaafStaffProfile` | **Done**: directory to call a colleague | Read-only look-up |
| Staff · setup | Org structure, recruitment, staff groups | Web only | |
| Academics | Homework, assignments | **Done**: homework. Assignments later | Short, phone-friendly |
| Academics · planning | Curriculum, lesson plans, quizzes, overview | Web only | Long forms |
| Exams | Marks entry (`ExmclResult`, award list) | **Done**: marks for one subject of one class | One subject at a time keeps it phone-sized |
| Exams · setup | Exams, subjects, datesheets, admit cards, report cards and formats, question papers, syllabus, CBSE registration, circulars | Web only | Printing and formats |
| Exam centre | Candidates, seating, rooms, Form 66, answer sheets, dispatch, guidelines, remuneration | Web only. **Done**: today's duties on Today | Centre printing; duties are the one phone fact |
| Activities | Houses, clubs, council, sports, tours, certificates | Web only | Admin and records |
| Clinic | `MdclCases`, `MdclSupplies` | **Done**: visit log. Supplies web only | Short form on the move |
| Transport | Vehicles, routes, assignments, crew, trips, live | Later: crew app (start trip, mark boarding) and live map | Needs `expo-location` (background) and `react-native-maps`: **a new EAS build** |
| Assets | Assets, locations, workflows, audits | Later: audit by scanning a tag | Needs `expo-camera`: **a new EAS build** |
| Finance | Collection, fee slips, structures, ledger, expenses, payroll, budgets, settings | **Now** (principal, read): fees this month on the glance. Rest web only | Counter and accounts are desk work |
| Library | Catalogue, circulation, members, fines, acquisitions, reports | Later: issue / return by scanning | Camera → new build |
| Settings | Users and access, roles, school profile, email, payments, billing, account | Web only (Your login stays in the app) | Admin |
| Leave | — | **Blocked**: no leave feature exists | See decisions |

## Tabs

Picked from permissions, not role names, so custom roles work. A login gets the first set it fits.

| Who (rule) | Tabs |
|---|---|
| Glance: can `clndr.events.approve`, or reads student attendance with scope `all` | Today · Approvals · Students · Calendar · More |
| Teacher: linked to a staff record, or can write student attendance | Today · Classes · Attendance · Calendar · More |
| Other staff (office, accountant, librarian, nurse, host only) | Today · Calendar · More (+ Meetings when a host) |

- The design's **Messages** tab becomes **Calendar**: there are no messages. Notifications sit behind
  the bell on every Today, as in the reference screen.
- A tab or shortcut shows only when the module is on for the school (`featureToggles`) and the login
  holds the permission. "Own classes only" logins see only their sections (the server already
  filters lists by scope; the app never offers a class it would refuse).
- Today, by who: teacher — next class `Hero`, unmarked register `Callout`, my periods `Timeline`,
  today's meetings if a host. Glance — four `StatTiles` (present today, fees this month, approvals,
  staff absent today), then "Waiting for you" `SwipeRow`s. Other staff — the day's calendar and
  meetings, with a `ShortcutGrid` of what they can use.

## Server work (small, only where the phone needs it)

1. `GET /timetable/me?from=&to=` — the signed-in teacher's periods with time, class, subject and room,
   from the published timetable and school days (extends `teacherSchedule.js`). Rule: covered by
   `timetable.timetable.read`; teachers without it get their own periods only, so it gets a
   `staff: true` route rule.
2. `GET /attnd/student-registers?date=` — the class-sections this login may mark, each with marked /
   not marked and absent count (scoped by `getAssignedSections`). Feeds the Today callout, the
   Attendance tab and the principal's "not marked" list. Matches the existing `^/student` rule.
3. Approvals count for the glance: from the existing calendar list (`status=pending_approval`) and
   appointments (`status=requested`); no new endpoint unless the counts are slow.

Each needs a stage deploy before its slice works on the phone. Tests in `server/src/**/__tests__`.

## Slices (each: `tsc` + `eslint` clean, EAS update to `preview`, checked on Android at large text)

1. **Foundation**: `usePermissions()` (`can`, `scopeOf`, toggles) for the app; staff tab sets;
   `src/staff/` services and React Query hooks; More for staff with "Open on the website".
2. **Today (teacher)**: server 1 and 2, then next class, unmarked registers, my periods.
3. **Roll call**: Attendance tab (my registers, today), roll call screen (search, all present by
   default, tap the absent, `ActionBar` "Save attendance · 3 absent"), offline queue in a file:
   saved on the phone, sent when a request next succeeds, `Callout` "Saved on this phone. It will be
   sent when you're back online." Last save wins, as on the web.
4. **My timetable**: `WeekStrip` + `Timeline`, from server 1.
5. **Calendar for staff**: `/calendar/me` agenda, reply, item sheet (reuse the family pieces),
   "Create event" pushed form → "Send for approval" (gap in the design: follows Apply for leave).
6. **Appointments as host**: today's meetings, act on them, notes, my hours.
7. **Principal glance**: `StatTiles`, Approvals tab (events + meeting requests, approve / reject with
   a reason), attendance today by class, Students search.
8. **Classes**: my sections → roster → student with guardian call buttons.
9. Then the "Later" rows, starting with notifications list polish, homework, staff directory.

## Decisions (25 Oct 2026)

1. **Leave**: left out for now. There is no leave feature on the web or server; it comes back as a module of its own.
2. **Messages**: the tab is Calendar; notifications sit behind the bell on Today.
3. **Roll call marks**: Present / Absent only, what the server stores.
4. **Server endpoints 1 and 2**: added.
5. **Tab rule**: the Approvals tab only goes to logins that can approve events (not every whole-school
   attendance reader), so office staff don't get a tab they can't act on.

## Done (25 Oct 2026)

| Slice | What | Code | Server |
|---|---|---|---|
| 1 | `usePermissions` (`lib/permissions.ts`), staff tab sets by permission (`staff/access.ts`), More with "On the website" | `app/(app)/(tabs)/_layout.tsx`, `more.tsx` | — |
| 2 | Teacher Today: next class `Hero`, unmarked registers `Callout`, your periods `Timeline` | `staff/TeacherToday.tsx` | `GET /timetable/me`, `GET /attnd/student-registers` |
| 3 | Attendance tab and roll call, offline queue (written to the phone first, sent at launch, on return and every 30 s); class lists kept on the phone | `(tabs)/registers.tsx`, `roll-call.tsx`, `staff/attendanceQueue.ts`, `lib/fileStore.ts` | Single-day save of one class no longer wipes the month's day settings; "marked" = saved on or after the day |
| 4 | Your timetable by week | `staff/MyTimetable.tsx` (route `timetable`) | — |
| 5 | Staff calendar (shared with families through `calendar/source.ts`), reply to events, create event for approval | `(tabs)/calendar.tsx`, `event-new.tsx` | — |
| 6 | Meetings for hosts: today, requests, upcoming, the meeting sheet, your hours and days off | `staff/HostMeetings.tsx`, `MeetingSheet.tsx`, `MyHours.tsx` | — |
| 7 | Principal glance (`StatTiles`), Approvals tab (`SwipeRow`s), attendance today, fee collection | `staff/PrincipalToday.tsx`, `staff/approvals.tsx`, `school-attendance.tsx`, `fee-collection.tsx` | — |
| 8 | Classes / Students: class list, search, roster, student with guardian to call | `staff/StudentsBrowser.tsx`, `class-roster.tsx`, `student/[id].tsx` | — |
| + | Notifications bell (unread dot) on every staff Today and the list; links open the app screen or the website page | `notifications.tsx`, `staff/useBell.ts`, `lib/notificationLinks.ts` | — |
| + | Staff attendance for one day: everyone present, tap the absent, staff groups, any past day; from the principal's "Staff absent" tile, office Today and More | `staff-attendance.tsx` | — (staff groups moved to `packages/shared/src/staffTypes.ts`, used by the website too) |
| + | Homework: due / drafts / past for the teacher's classes or one class, post and edit (published at once), publish a draft, close; from a class roster and More. Families see it in the app and on the web portal (portal section `homework`) | `homework/index.tsx`, `homework/new.tsx` | `GET /portal/students/:id/homework` for families |
| + | Staff directory: search, staff groups, call a colleague | `staff-directory.tsx` | `GET /teachers?lite=true` (names and numbers only, no bank or ID details) |
| + | Marks for one subject of one class: exam picker, classes with each subject's progress, a number box per student, absent per subject | `marks/index.tsx`, `marks/entry.tsx`; kit `NumberCell` | `POST /exam-results/bulk` with `subjectId` changes only that subject (other subjects' marks are left alone) |
| + | Exam duties on Today (invigilation room, centre duty), from the calendar's "My duties" layer | `staff/TodayDuties.tsx` | — |
| + | Clinic visit log: today and the last 30 days, log or add to a visit with a student picker; on Today for clinic staff | `clinic/index.tsx`, `clinic/visit.tsx` | — |

Kit added on the way: `useFixedColumn`, `MonthPicker` (documented in `mobile/src/ui/DESIGN.md`).

Checked against stage data (R.E.D. School, Jhajjar) through the API calls each screen makes, and by the
user on an Android phone for slices 1–6. Also checked on stage: a family's meeting request confirmed and
declined by the host; the "own classes only" limit with a teacher who has only 3rd-B (registers, students,
roll call, events and homework for other classes are all refused); homework as a parent. Not checked:
exam duties on Today (stage has no duty assignments), the web portal's Homework page (stage site is behind
Vercel login).

Every "Later" row that needs no new EAS build is done. Needing a new EAS build: the transport crew app,
the live bus map, scanning for assets and library books.

---

# Next: every staff page on the phone (plan of 27 Oct 2026, waiting for approval)

Goal: More → "On the website" ends up holding only desk work, each with its reason below. Every staff web page
(`client/src/App.tsx` routes, `packages/shared/src/tenantFeatureCatalog.json`) is marked **In app** (done),
**Bring** (with the phone pattern and its slice number) or **Web only** (reason). Endpoints named are the ones the
web already calls; "server:" marks the few places a phone flow needs something new.

Before any new screen: **slice 0, sizing pass** on every existing staff and family screen at 360 × 640dp with 1.3×
text (roll call and staff attendance rows, marks rows, `StatTiles`, nav titles with class and subject, `Hero` values,
`ActionBar` text), fixes in the kit where shared, each screen's check written down.

## Native modules (each needs a new EAS build and a version bump: ask first)

Not installed today: `expo-image-picker` (photos: student photo and documents, an expense bill, a clinic note),
`expo-camera` (scanning asset tags and library barcodes), `expo-location` + `react-native-maps` (crew app, live bus).
`expo-sharing` and `react-native-webview` are installed, so viewing and sharing PDFs (receipts, report cards, ID
cards) ships as an update. Slices that would need a picker ship without the upload first and say so.

## Page by page

### Everyday, all staff
| Web page | Mark | Phone pattern |
|---|---|---|
| `Home`, `Dashboard` | In app | Today tab by mode |
| `Notifications` | In app | Bell + list |
| `CalendarPage` | In app | Calendar tab, reply, create for approval |
| `CalendarEvents` (manage) | **Bring · 1** | My events list (`ChipRail` upcoming / waiting / drafts / past) → event record (`DetailList`, replies counted by answer) → "Who hasn't replied" list with call buttons → `ActionSheet`: edit, send a reminder (`POST /calendar/events/:id/remind-pending`), cancel (`Dialog`). Edit = the create form prefilled (`PATCH /:id`). Audience builder stays as on create (segments picked from `/audience/options`) |
| `settings/SchoolDays` | **Bring · 2** | Principal declares a holiday or closure on the move: month list of school-day rules, "Add a day off" sheet (date, name, all classes or some; `POST /school-days/rules`; the calendar reads them from `/calendar/days`), cancel a rule. Weekly offs and session setup stay on the web (setup) |
| `AccountSettings` (your login) | In app | Your login |
| `HelpSupport` | Web only | Long help pages; the app's Your login links to it |

### Teachers
| Web page | Mark | Phone pattern |
|---|---|---|
| `AttndStudentAttendance` | In app | Roll call, any day |
| `ExmclResult` (marks entry) | In app | One subject of one class |
| `AcdmcHomework`, `AcdmcWorkDetail` (homework) | In app | Homework |
| `AcdmcAssignment`, `AcdmcQuiz`, `AcdmcWorkDetail` | **Bring · 3** | Same screens as homework with a kind switch; a work's record shows submissions summary; "Check submissions" = roster where each row opens a sheet (status `OptionList`: submitted, late, missing, excused; marks `NumberCell` when the work has max marks). Saves only the changed rows (check the update endpoint merges, as marks did) |
| `TeacherWise` (my timetable) | In app | Your timetable |
| `ClassWise` | **Bring · 4** | Class picker → `WeekStrip` + `Timeline` of that class's day, from the published version (`/timetable/state` read; server: a `GET /timetable/class/:section?from=&to=` like `/timetable/me` if the state is too big for a phone) |
| `TeacherWise` (any teacher, principal) | **Bring · 4** | Staff directory row → "Timetable" → the same week view for that teacher (server: `/timetable/me` with `teacherId` for logins holding `timetable.timetable.read`) |
| `Substitution` | Blocked | No server data; needs the web feature first (then: today's absent teachers → free teachers per period, assign in a sheet) |
| `AcdmcLessonPlan` | **Bring · 9** | My lesson plans by week (list), record, "Mark taught" if the model has a status; writing a full plan stays on the web (long rich form) |
| `AcdmcCurriculum`, `AcdmcCurriculumDetail` | **Bring · 9** (read) | Class + subject → units with coverage `ProgressRing` (`/acdmc/curriculum/:id/coverage`). Authoring the curriculum stays on the web (long tree form) |
| `AcdmcOverview` | **Bring · 9** | Principal: coverage by class as a list, no charts |

### Office, front desk, principal
| Web page | Mark | Phone pattern |
|---|---|---|
| `Students`, `StudentProfile` | In app (look-up) · **Bring · 6** (edit) | Student record gets "Edit" → pushed form by section (personal, guardians, address, class), `ActionBar` "Save changes"; only changed fields sent. "Add a student" from the Students list (`POST /students`, next roll number from `/students/next-roll-number`). Documents: list and open (share sheet); upload waits for the picker build |
| `StudentInfo` (stdntboard) | **Bring · 6** | Principal: counts by class as a `ListGroup` under Students, not a dashboard |
| `AlmniDirectory` | **Bring · 6** | Search + list + record with call / email |
| `StdntIdCards` | **Bring · 6** (view) | Student record → "ID card": the card from `POST /id-cards/generate` for one student in a WebView, share. Card design and class-wise printing stay on the web |
| `StaafStaffMembers`, `StaafStaffGroup` | In app | Staff directory |
| `StaafStaffProfile` | **Bring · 7** | Directory row → staff record (`DetailList`: role, groups, joining, contact; bank and ID details only with `staaf.staff.write`), "Edit" pushed form by section for the office. "Add a staff member" from the directory |
| `StaafOverview` | **Bring · 7** | Counts by staff group as list headers in the directory |
| `StaafOrgStructure` | Web only | A drawn chart; the directory's groups cover the look-up |
| `StaafRecruitment` | Web only | Long application forms and documents at a desk; revisit if schools ask |
| `AttndStaffAttendance` | In app | Staff attendance |
| `Attndboard` | In app | Principal attendance today |
| `AppntPages` today, appointments (host) | In app | Meetings |
| `AppntPages` today, appointments (front desk) | **Bring · 5** | Desk Today: all hosts' meetings by time, arrivals; "Book a meeting" pushed form (host, student or visitor from `/appnt/lookup/*`, `WeekStrip` + `SlotPicker` from `/hosts/:id/slots`); "Walk-in" sheet (`POST /appointments/walk-in`); check in / done / no-show / cancel / reschedule in the meeting sheet |
| `AppntPages` hosts | **Bring · 5** | Hosts list, turn a host on or off, edit a host's hours (reuses Your hours) |
| `AppntPages` availability | In app | Your hours |
| `AppntPages` settings, reports | Web only | Setup and monthly numbers |
| `settings/UsersAndAccess`, `UserDetail` | **Bring · 10** | Admins: users list (search, `ChipRail` staff / parents / students / invited), record, "Create a login" sheet, reset password (sends the email), turn off, change roles (`OptionList multiple`). Same endpoints as the web |
| `settings/Roles`, `RoleEditor` | Web only | Permission grid of every module × action: a desk task done once |
| `settings/SchoolEmail`, `SchoolPayments` | Web only | SMTP and Razorpay secrets: typed once at a desk, never shown again |
| School profile (`/school-profile`) | **Bring · 10** (view, edit contact fields) | Logo and letterhead stay on the web |
| `Billing`, workspace closure | Web only | Billing and account closure |

### Accounts
| Web page | Mark | Phone pattern |
|---|---|---|
| `CpitlDashboard` | In app (principal glance: fees this month) · **Bring · 8** | Finance Today for accountants: collected today / this month `StatTiles`, recent payments |
| `CpitlCollection`, `CpitlStudentLedger` | **Bring · 8** | Counter: `SearchBar` student (`/cpitl/students`) → account (dues by head, paid, balance; `/students/:id/account`) → "Record a payment" pushed form (amount, mode cash / UPI / cheque / bank with reference, date; `POST /students/:id/payments`) → success `StatusView` with "Share receipt" (`/payments/:id/receipt.pdf` via share sheet). Cancel a payment: `ActionSheet` → `Dialog` with reason, only with the cancel permission |
| `CpitlPayments` | **Bring · 8** | Payments list by day and mode, cheque status update in a sheet |
| Defaulters (collection filter) | **Bring · 8** | Dues list by class with amount and days overdue, call the guardian |
| `CpitlFeeSlips` | Web only | Printing slips in bulk |
| `CpitlFeeStructures`, `CpitlFeeStructureDetail`, `CpitlSettings` | Web only | Fee setup once a year; waivers of one demand are in the student account (**8**) |
| `CpitlExpenses`, `CpitlOperating`, `CpitlFuel`, `CpitlElectricity` | **Bring · 11** | "Record an expense" pushed form by kind (category, amount, paid to, date, note; fuel: vehicle, litres, odometer; electricity: connection, units), list by month with void in an `ActionSheet`. Bill photo waits for the picker build. Analytics and projections stay on the web |
| `CpitlPayroll`, `CpitlSalary`, `CpitlPayrollRun` | **Bring · 11** (view) | Month → run status and totals, staff rows with net pay; running and approving payroll stays on the web (statutory checks over a full grid) — revisit approval on the phone once the run has an approve step |
| `CpitlBudgets`, `CpitlInfra`, `CpitlInfraDetail` | Web only | Yearly planning sheets. Infra project status (view) can join **11** if asked |

### Exams (internal)
| Web page | Mark | Phone pattern |
|---|---|---|
| `ExmclExams`, `ExmclDatesheets` | **Bring · 9** | Exams list → exam record with its datesheet as an `Agenda` by day; creating exams and datesheets stays on the web |
| Results overview + publishing | **Bring · 9** | Exam → classes × subjects progress (`/exam-results/status`), "Publish results" `ActionBar` (`PUT /exam-definitions/:id/results-publication`) with a `Dialog` (families are told) |
| `ExmclReportCard` (one student) | **Bring · 9** | Student record → "Report card": `/report-cards/single` in a WebView, share |
| `ExmclAwardList` (view) | **Bring · 9** | Covered by marks entry per subject; the printable award list stays on the web |
| `ExmclAdmitCards`, `ExmclReportCardFormat`, `ExmclAwardListFormat`, `ExmclAdmitCardFormat`, `Performas` | Web only | Print layouts and formats |
| `ExmclSubjects`, `ExmclMarksDistribution`, `ExmclSyllabus`, `ExmclQuestionPapers`, `ExmclCbseRegistration`, `ExmclCirculars` | Web only | Exam setup, file uploads and board registration at a desk |

### Exam centre (CNTR and the exam-centre pages of internal exams)
| Web page | Mark | Phone pattern |
|---|---|---|
| Duties (my duty today) | In app | Today |
| `CentreDetails`, `Candidates`, `CandidateDetail`, `DateSheets`, `SeatingPlan`, `RoomAllocation`, `Form66`, `AnswerSheets`, `AnswerSheetDetails`, `DispatchSlip`, `Attendance`, `PwdInfo`, `Umcs`, `Stickers`, `Performas`, `Remuneration`, `UndertakingForm`, `CentreGuidelines`, `CBSECirculars`, `CBSEPortals`, `Subjects`, `TeacherDetail`, `Duties` (assigning) | Web only | Board-centre operations: PDF imports, seating and room plans, Form 66, stickers and dispatch printing, done by the centre superintendent at a desk |

### Activities
| Web page | Mark | Phone pattern |
|---|---|---|
| `ActvtHouses`, `ActvtHouseDetail`, `ActvtHouseRanking` | **Bring · 12** | Houses list with points and rank, house record with members; "Award points" sheet if the house model takes point entries |
| `ActvtClubs`, `ActvtClubDetail` | **Bring · 12** | My clubs (in-charge) → members, call a guardian |
| `ActvtStudentCouncil` | **Bring · 12** (view) | Posts and who holds them; elections setup stays on the web |
| `ActvtStudentProfile` | **Bring · 12** | A section on the student record: house, clubs, posts, certificates |
| `ActvtBoard`, `ActvtFunctions`, `ActvtSports`, `ActvtTours` | **Bring · 12** (view) | Upcoming as an `Agenda`; tours: list with students going. Planning forms stay on the web |
| `ActvtCertificates` | **Bring · 12** | View a student's certificates; "Record a certificate" sheet. Certificate design stays on the web |
| `Activities` (old page) | — | Redirect, nothing to do |

### Clinic, library, assets, transport
| Web page | Mark | Phone pattern |
|---|---|---|
| `MdclCases` | In app | Clinic visits |
| `MdclSupplies` | **Bring · 13** | Supplies list (`ChipRail` all / low), item record, "Add stock" / "Use" sheet with `Stepper`, reorder level edit |
| `LibryCirculation`, `LibryBarcodeDesk` | **Bring · 14** | Issue: member search (`/libry/members/lookup`) → type accession number (`/copies/lookup`) → "Issue book" (`POST /loans/issue`); return / renew by accession number; scanning comes with the camera build |
| `LibryCatalogue`, `LibryInventory` | **Bring · 14** | Catalogue search → title record with copies and who has them |
| `LibryMembers` | **Bring · 14** | Member record: books out, due, fines; collect or waive a fine (`/fines/:id/waive`) |
| `LibryOverview` | **Bring · 14** | Library Today: due today, overdue, issued today |
| `LibryAcquisitions` | **Bring · 14** (review) | Teachers' book requests: approve / reject in `SwipeRow`s. Purchase orders and suppliers stay on the web |
| `LibryStocktakes`, `LibryAudit` | Later (camera build) | Shelf scanning |
| `LibryReports`, `LibryDigitalLibrary`, `LibryReading` | Web only (reports) · Later (reading lists for teachers) | Reports are print/export; reading lists revisit with families' reading in the app |
| `AsetsAssets`, `AsetsAssetDetail`, `AsetsLocations`, `AsetsLocationDetail` | **Bring · 15** | Asset search and by location; record; "Allocate" / "Move" / "Return" sheets (`/allocations`, `/transfers`) |
| `AsetsMaintenance` | **Bring · 15** | "Report a problem" sheet from any asset or location (anyone with the permission), the maintenance list for the in-charge with status updates |
| `AsetsStock` | **Bring · 15** | Consumables: stock list, adjust in a sheet |
| `AsetsDisposals` | **Bring · 15** (approve) | Disposal requests to approve in the Approvals tab |
| `AsetsDashboard` | **Bring · 15** | Counts as list headers, no charts |
| `AsetsAudits` | Later (camera build) | Audit by scanning tags; without scanning, ticking items in a list is possible — ask |
| `AsetsCategories`, `AsetsVendors`, `AsetsProcurement`, `AsetsReports`, `AsetsSettings` | Web only | Setup, purchasing paperwork and reports |
| `TrnstOverview`, `TrnstVehicles`, `TrnstRoutes`, `TrnstAssignments`, `TrnstTrips` | **Bring · 16** (view) | Transport Today: trips running and done; routes → stops `Timeline` → students on the route with guardian calls; vehicles with documents' due dates. Changing a student's route: one sheet (`/assignments/bulk` with one student). Route and vehicle setup stays on the web |
| `TrnstSelfStudents` | **Bring · 16** (view) | Students who come on their own, list |
| `TrnstCrew`, `TrnstLive` | Later (location build) | Crew app and live map need `expo-location` and `react-native-maps` |

### Timetable and school setup (web only, reason: built once per term at a desk)
`TimetableTeachers`, `TimetableClasses` (also `stdnt/classes`), `TimetableSubjects`, `Departments`, `BellTimings`,
`Generate`, `PeriodAllocation`, `SubjectAllocation`, `Versions`, `Formats`, onboarding pages, every bulk import
(students, staff, candidates), `Stickers`, `Performas`, `GetStarted`.

## Slice order (by how often staff need it on the move)

0. Sizing pass (all existing screens) · 1. Manage my events · 2. School days off · 3. Assignments and quizzes ·
4. Class and teacher timetables · 5. Front desk meetings · 6. Student records (edit, add, alumni, ID card) ·
7. Staff records · 8. Fee counter, payments, dues · 9. Exams: list, datesheet, results status and publish, report card,
lesson plans and coverage · 10. Users and access, school profile · 11. Expenses and payroll view · 12. Activities ·
13. Clinic supplies · 14. Library desk · 15. Assets · 16. Transport (view).
Then, with your go-ahead for a new build: photos (picker), scanning (camera), crew app and live map (location, maps).

Each slice removes its `WEB_MODULES` entry (or the pages it covers) and the `openWebsite` buttons it replaces
(`fee-collection.tsx`, `student/[id].tsx`). When slice 16 is done "On the website" keeps only: Timetable setup,
Exam setup and print formats, Exam centre, Finance setup, Library and asset purchasing and reports, Roles, School
email and payments, Billing — each row in the app showing its one-line reason.

## Questions for approval
1. The order above (calendar management and school days first, then teacher work, then office, then accounts).
2. Users and access on the phone for administrators (slice 10): creating logins and resetting passwords from a phone is
   convenient but powerful; it uses the same permission checks as the web.
3. Payroll and recruitment stay view-only / web-only as written.

## Done: slice 0, sizing pass (27 Oct 2026)

Checked in the web preview at 360 × 640 with `?text=1.3&os=android` (kit text scaled as Android does, Android nav
bar) against stage data, signed in as the teacher with a staff record, the administrator, the clinic nurse and the
parent; then at 390 × 844 with 1.0× text to confirm the normal layouts are unchanged. Not checked on a real phone yet;
the web ignores `adjustsFontSizeToFit` (tab labels, bar titles, `Hero` values shrink on the phone instead of "…").

| Screen (who) | Found at 360 / 1.3× | Fix |
|---|---|---|
| Roll call, staff attendance | Name cut to 3 letters beside Present / Absent | Kit: `ListItem` `accessoryWidth`: the control goes under the name, full width, when the name would get under 12 characters |
| Every `ActionBar` (roll call, homework, events, marks, clinic, meetings, fees) | Summary cut to "1 …" | Kit: no icon tile, summary and detail on top, action under them; `MobileScreen` pads for the bar's measured height |
| Principal Today | `StatTiles` labels cut ("Present …"), amount filling the tile | Kit: stack from 1.15× text or below 360 wide, as compact rows |
| Teacher Today, Your timetable | "12:10 …" in the periods | Kit: `Timeline` time column 64 → 70 |
| Today meetings, Meetings (host and family) | Visitor's name cut beside the status badge | Kit: badge under the text on tight screens; meeting rows take two lines |
| Your hours, Marks (exam row), fee collection, results | Day names or the chosen value cut | Kit: a value that won't fit beside the title goes under it |
| Attendance today, family attendance | "100%" spilling out of the ring | Kit: `ProgressRing` figures stop growing at 1.1× |
| Fee collection, Hero cards | Label and meta squeezed into two narrow columns | Kit: meta under the label on tight screens; value up to two lines, shrinks to fit |
| Notifications | Titles cut ("Your visitor has arri…") | Kit: `SwipeRow` title two lines |
| Calendar (staff and family) | Event titles cut at two lines | Kit: `Agenda` titles three lines |
| Student record | Guardian's phone number cut | Guardian and student rows take two lines |
| Family Home | Notice titles cut | Two lines |
| Pushed screens (iOS) | Centred title squeezed by the back label | Kit: back label hidden on tight screens (Android never shows it); bar titles shrink to 0.8 before "…" |
| Tab bar | "Attendance", "Approvals" don't fit 72dp | Kit: labels shrink to the 12px floor at 1.3× |
| Clinic Today | "Hi, Ms." | Greeting skips titles (Mr, Mrs, Ms, Dr…) |

Fine as they were: Classes, Attendance tab, marks entry rows (the box leaves room for 13+ characters), Calendar
`WeekStrip`, More (staff and family), new event, homework list and form, clinic list and visit form, staff directory,
Approvals, Students, meeting sheet, family fees, notices, results, transport, profile, request a meeting, Your login.
Web-only noise seen in the preview: a `collapsable` warning from React Native Web.

## Done: slices from the plan of 27 Oct 2026

Each checked in the web preview (360 × 640, `?text=1.3&os=android`) against stage, as the role that uses it, then
published to `preview`.

| Slice | What | Code | Checked on stage |
|---|---|---|---|
| 1 | Manage events: Events list (coming up, drafts, waiting for approval, past and cancelled; managers switch to everyone's), event record with replies by audience, who hasn't replied (opens the child's record to call a guardian), send a reminder, edit (only changed fields are sent; an audience is sent back whole with its key so replies stay), send a draft for approval, cancel with a reason and "tell families", delete a draft. From More → Events and the Calendar tab. "Attendance" left "On the website" (roll call, staff attendance and attendance today cover its pages) | `events/index.tsx`, `events/[id].tsx`, `events/replies.tsx`, `event-new.tsx` (edit), `services/eventService.ts`, `staff/eventQueries.ts` | Teacher: list, record, replies, edited the venue of her pending event (stayed pending, audience key kept) and put it back. Admin: everyone's events, consent replies, sent one reminder (1 person), cancel sheet opened and closed without cancelling |
| 2 | School days: next day off, coming up and past, weekly days off (read), add or edit a holiday, closure (closed, online, hybrid), vacation, half day (when school ends) or extra working day, for the whole school or some classes, announce it now to families and staff (principal and office), remove. More → School days for logins with `core.schooldays.write`. "Calendar" left "On the website" | `school-days/index.tsx`, `school-days/new.tsx`, `services/schoolDaysService.ts`, `staff/schoolDayQueries.ts`, `staff/schoolDayUi.ts` | Admin: list, added a half day for tomorrow without announcing, removed it; edit form for the announced Diwali vacation (no save) |
| 3 | Assignments and quizzes: Homework, Assignments and Quizzes in one list (kind chips), set and edit an assignment (maximum marks), check who turned in homework, check and mark an assignment or quiz (a number box per student, status and remark in a sheet, "everyone pending turned it in"), saving only the students that changed (each row whole, as the server replaces it). Quizzes are written with their questions on the website (long form). Fixed on the way: editing homework from the phone no longer unlinks its curriculum topics | `homework/index.tsx`, `homework/new.tsx`, `homework/check.tsx`, `services/homeworkService.ts`, `staff/workUi.ts` | Teacher: set "Essay: my favourite festival" for Class 7-A (out of 20), 25 refused, saved 17 for Aarav (server: submitted, 17); homework check list |
| 4 | Class and teacher timetables: Timetables (classes with their class teacher, teachers) → a week view of one class (subject and teacher per period) or one teacher, with the school's days off and half days. Read from the published timetable the website's Class wise and Teacher wise pages use, and worked out on the phone the same way as `GET /timetable/me` (`staff/timetableGrid.ts`), so no server change; for logins that read timetables. "Your timetable" uses the same week view | `timetables/index.tsx`, `timetables/view.tsx`, `staff/MyTimetable.tsx`, `staff/timetableGrid.ts`, `staff/timetableQueries.ts`, `services/timetableService.ts` | Admin: Class 7-A's Tuesday (English with Mrs. Anjali Sharma at 8:20) and Mrs. Kavita Malik's (Mathematics in 7-A and 3-B) match the grid. Teacher: "Your timetable" unchanged |
| 5 | Front desk meetings: everyone's meetings with the host on each row (front desk, office, principal), "Book or walk-in" (a parent picked by child with the guardian filled in, a visitor, staff or vendor; host, free time from their slots, in person, phone or video, purpose), check-in at once for walk-ins, change the time of a meeting, Hosts (turn someone on or off, their hours and days off, add a staff member as a host). Today shows the desk everyone's meetings. "Appointments" left "On the website"; its settings (purposes, notice) and reports stay there | `meetings/book.tsx`, `meetings/reschedule.tsx`, `meetings/hosts.tsx`, `meetings/hours.tsx`, `staff/HostMeetings.tsx`, `staff/MeetingSheet.tsx`, `staff/MyHours.tsx` | Admin: booked Vipin Beniwal (Aarav's guardian) with Mrs. Anjali Sharma for Wed 28 Oct 2:45 pm, moved it to 2:15 pm, then cancelled it (APT-2026-0005); Hosts and her hours |
