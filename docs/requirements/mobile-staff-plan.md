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
| Staff | `StaafStaffMembers`, `StaafStaffProfile` | Later: directory to call a colleague (principal) | Read-only look-up |
| Staff · setup | Org structure, recruitment, staff groups | Web only | |
| Academics | Homework, assignments | **Done**: homework. Assignments later | Short, phone-friendly |
| Academics · planning | Curriculum, lesson plans, quizzes, overview | Web only | Long forms |
| Exams | Marks entry (`ExmclResult`, award list) | Later: marks for one class and one exam | A grid of marks is borderline on a phone |
| Exams · setup | Exams, subjects, datesheets, admit cards, report cards and formats, question papers, syllabus, CBSE registration, circulars | Web only | Printing and formats |
| Exam centre | Candidates, seating, rooms, Form 66, answer sheets, dispatch, guidelines, remuneration | Web only. Later: "my invigilation duty today" | Centre printing; duties are the one phone fact |
| Activities | Houses, clubs, council, sports, tours, certificates | Web only | Admin and records |
| Clinic | `MdclCases`, `MdclSupplies` | Later: the nurse logs a visit | Short form on the move; few users |
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

Kit added on the way: `useFixedColumn`, `MonthPicker` (documented in `mobile/src/ui/DESIGN.md`).

Checked against stage data (R.E.D. School, Jhajjar) through the API calls each screen makes, and by the
user on an Android phone for slices 1–6. Not yet checked: answering a family's meeting request (no parent
login on stage), the "own classes only" limit with a teacher who doesn't teach every class.

Next, from the "Later" rows: the staff directory, marks for one class,
"my invigilation duty today", the clinic visit log. Needing a new EAS build: the transport crew app, the
live bus map, scanning for assets and library books.
