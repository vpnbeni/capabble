# Next: the whole staff side in the app, sized for Android

Brief for the session that continues the staff app (written 27 Oct 2026). Paste it as the first message.

---

Continue the staff side of the Capabble mobile app (Expo, `mobile/`) so admin, principal, teachers and
other staff do **all** their work in the app, with every screen fitting small Android phones.

## Read first, in this order
1. `CLAUDE.md` (repo root) and `mobile/AGENTS.md`, especially "Staff app: everything in the app",
   "Small Android screens come first" and "How we ship".
2. `mobile/src/ui/DESIGN.md` (the kit; "Platform notes" for Android sizing) and `client/src/components/ui/DESIGN.md` (voice, colour, status).
3. `docs/requirements/mobile-staff-plan.md`: decisions, the module table and the "Done" table of what exists.
4. The code that's there: `mobile/src/staff/` (access, queries, screens), `mobile/src/app/(app)/` routes, `mobile/src/services/`.

## Where things stand
- Built and on the `preview` channel: tabs by permission (teacher, principal, other staff), teacher Today, roll call with
  offline queue, my timetable, calendar with create-event for approval, meetings for hosts, principal glance and
  approvals, classes and students, notifications, staff attendance, homework (and homework for families), staff
  directory, marks for one subject, duties on Today, clinic visits.
- Still opens the website (More → "On the website", `staff/access.ts` `WEB_MODULES`, and buttons calling `openWebsite`).
  Each of these needs a phone screen unless it is true desk work:
  - **Students**: add and edit a student, documents, ID cards (view), alumni look-up.
  - **Staff**: staff profile (record view and edit for the office).
  - **Timetable**: class-wise timetable, substitutions (no server data yet: needs the web feature first), teacher-wise view for the principal.
  - **Calendar**: manage events (edit, cancel, see responses and who hasn't replied, send a reminder), school days (holidays, closures).
  - **Academics**: assignments, quizzes (view and mark submissions), lesson plans, curriculum coverage.
  - **Exams**: exams list and datesheets, results overview and publishing, report cards (view a student's), award lists (view).
  - **Activities**: houses, clubs, events, student council, certificates (view and record).
  - **Clinic**: supplies (stock, reorder level).
  - **Transport**: vehicles, routes, assignments, trips (view); the crew app and live map need a new EAS build (ask first).
  - **Finance**: fee collection at the counter (find a student, record a payment, receipt), defaulters, expenses log, payroll view.
  - **Assets**: list, a record, allocate and move, maintenance requests; scanning needs a new EAS build (ask first).
  - **Library**: catalogue search, issue and return (by typing the accession number until scanning is built), members, fines.
  - **Appointments**: front-desk booking and walk-ins, hosts and settings.
  - **Settings** for administrators: users and access (create a login, reset a password, roles), school profile.
- Web-only by design (keep the website link, write the reason in the plan): bulk imports, print layouts and report formats
  (admit card, report card, award list and ID card designs, seating plans, Form 66, stickers), timetable generation and
  setup, exam centre (CNTR) operations, billing and workspace closure.

## What to do
1. **Plan first, for my approval before code.** Go through every staff web page (`client/src/pages/*`, routes in
   `client/src/routes`, features in `packages/shared/src/tenantFeatureCatalog.json`) and mark each: in the app already /
   bring into the app (with the phone pattern) / web-only (reason). Order the "bring" list by how often staff need it on
   the move. Update `docs/requirements/mobile-staff-plan.md` with the result.
2. **Fix sizing on Android before adding screens.** Review every existing staff and family screen at 360 × 640dp with
   1.3× text (the rules in `mobile/AGENTS.md`). Known risks: roll call and staff attendance rows (name + Present/Absent
   switch), marks rows (name + number box), `StatTiles`, nav titles with class and subject, Hero values, ActionBar text.
   Fix in the kit where the problem is shared, and say how each screen was checked.
3. **Then build in thin slices**, each shippable: screen + service + React Query hooks, gated by `useStaff()` and the
   school's feature toggles, remove its "On the website" entry when the phone covers it. Reuse the web's endpoints; add a
   server endpoint only when a phone flow needs one (with tests, `cd server && npx jest`).
4. After each slice: `npx tsc --noEmit`, `npx eslint src`, check it on stage as the role that uses it, publish the EAS
   update and tell me plainly when it is live. Server changes need my push and `deploy-stage`; check
   `git ls-remote origin stage` before testing them.

## Rules learned the hard way
- The keyboard must never cover the focused field (forms in `MobileScreen` / `BottomSheet` with `MobileTextField` or `NumberCell`).
- Chrome labels stay on one line; fixed columns grow with the text size (`useFixedColumn`).
- Copy: sentence case, buttons start with a verb, errors say what to fix, never module codes; same status words as the web.
- Never write a save that replaces a whole record when the phone changes one part (marks were fixed with a one-subject save).
- Stage school: R.E.D. School, Jhajjar (slug `06150107536`). Test logins (admin, teachers, parent, clinic) are in the
  agent's memory; I'll give the admin login if it's missing. Only the stage API (stageapi.capabble.cloud) is used for tests.
