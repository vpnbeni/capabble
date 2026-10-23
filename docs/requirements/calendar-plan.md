# Calendar (CLNDR) — implementation plan

Status: built 23 Oct 2026 (phases 0–6; see §13 for what was left for later) · builds on [universal-calendar-research.md](universal-calendar-research.md)

## 1. Name and packaging

**In the app: "Calendar". Module code: `CLNDR`.** It goes in the sidebar next to Home, at the route `/calendar`, with server code in `server/src/modules/clndr`.
- Users look for the word "Calendar", and every competitor uses it. A clever name would make it harder to find.
- `CLNDR` follows the five-letter module codes (STDNT, APPNT, ASETS).
- **"Almanac"** is what many Indian schools call the printed diary, and it's a good word for marketing ("your school almanac, live"). As a code (ALMNC) it would sit too close to ALMNI (alumni), so it isn't used here.

Inside the module there are two things:
- **School days.** One list of working days, holidays, vacations, half days and closures. It belongs to the core layer because attendance, timetable, fees, appointments and transport all need it, even in a school that uses nothing else.
- **Events.** Scheduled events with audience segments, instructions for each audience, notifications and email.

**Packaging (recommended):** turn the `clndr_calendar` feature on by default for every tenant, so every dashboard has a calendar. The read side (my calendar, school days, dates from other modules) is part of the base product. Event authoring with email is also on by default, but behind its own feature key (`clndr_events`) so it can be priced separately later if needed. If CLNDR is switched off, school days still work for the other modules.

## 2. Core ideas (from the research)

1. **One event with segments.** An event has shared fields (title, date, venue, description). Each **segment** has its own audience rule, instructions, event role, notification level and, later, a response type. Each viewer sees only the segments that match them, with a label such as "As class teacher of 7B" or "For Aarav (5A)".
2. **The calendar is worked out per viewer, not copied to each person.** Events store audience rules plus a flat list of `targetKeys`. "My calendar" works out the viewer's own keys and runs one indexed query. The actual list of people is resolved only when sending, and kept as an audit record.
3. **Other modules keep ownership of their dates.** Each active module provides its dates to the calendar read-only. Clicking an item opens it in that module, and those items never send a second notification.
4. **School days drive the other modules.** Attendance, timetable, appointments, fees, library and transport read one source for "is this a working day, for this class".
5. **Dates are real IST days, not tied to the selected session.** Events and day rules are school-wide and carry no session filter. A session label is stored only for reporting, and module dates pass the session explicitly.

## 3. Data model (tenant DB)

None of these collections use `academicSessionPlugin`. Date-only values are `YYYY-MM-DD` strings in IST; timed values are UTC `Date` values plus the tenant time zone. Workspace archives copy every tenant collection automatically, so no archive format change is needed.

### `SchoolDayRule` (`school_day_rules`) — core
```
kind: weekly_off | holiday | vacation | half_day | closure | working_day   (working_day overrides an off day)
startDate, endDate            'YYYY-MM-DD', inclusive
weekly: { weekday 0-6, weeksOfMonth [] }      (weekly_off only, e.g. Sat + [2,4])
category: national | state | school | religious | other    (holiday)
appliesTo: { scope: school | classes, classes [], sections [] }   (normalised with rbac/scope.js)
mode: closed | online | hybrid                 (closure)
halfDay: { endTime, bellTimingId? }
authority, orderNo, reason, tentative: bool
eventId?                      (the published announcement, if any)
status: active | cancelled, revision, createdBy, timestamps
```
Service `schoolDays.dayInfo(models, dateKey, { className, section })` returns `{ working, kind, label, mode, halfDayEnd }`. `schoolDays.range(from, to, scope)` gives the same for a date range. All modules call these two.

### `CalendarEvent` (`calendar_events`) — CLNDR
```
uid (uuid@<slug>.capabble.cloud), revision (raised on every material change)
title, description, category (exam | holiday | ptm | celebration | sports | trip | meeting | duty | health | deadline | other)
allDay, startDate/endDate (all-day) | startAt/endAt (timed), venue
recurrence: { freq: daily|weekly|monthly, interval, byDay [], until, exDates [] }   (supported subset only; until defaults to session end)
status: draft | pending_approval | scheduled | published | cancelled
publishAt, approvedBy, circularNo, attachments []
visibility: segments | all_staff | whole_school   (who can see it at all; all_staff / whole_school also
                                                   give everyone outside the segments an in-app notice on
                                                   publish, change and cancel: no email, no reminders)
segments: [{
  id, label,
  personType: parent | student | staff,
  scopes: [{ type: all|class|section|house|route|role|user, value }],
  exclude: [{ type, value }],
  role: incharge | duty | participant | attendee | fyi,
  instructions, attachments [],
  notify: now | in_app | silent,          (digest comes later)
  reminders: ['day_before_18', 'morning_07'] (presets),
  response: none                          (acknowledge | rsvp | consent come in phase 5)
}]
targetKeys: [String]          (union of segment keys, indexed, multikey)
academicSession (tag), createdBy, cancelledAt/By, timestamps
```
Indexes: `{ targetKeys: 1, startDate: 1 }`, `{ status: 1, publishAt: 1 }`, `{ uid: 1 }` (unique).

### Later collections
- `CalendarSend`: an audit row per publish, change or reminder, with segment counts and counts of people who couldn't be reached.
- `MailOutbox`: one row per email, generic and reusable by any module.
- `CalendarResponse`: phase 5.
- `IcalToken`: phase 6.

### Changes to existing data
- **`AcademicSession`:** add `startDate` and `endDate`. The default is derived from the label (1 Apr – 31 Mar). Terms are optional.
- **`SchoolProfile`:** add `timeZone` (default `Asia/Kolkata`) and use the existing `email` as the school's Reply-To.
- **Legacy `Calendar`:** remove the model, controller, routes, seeder and model key. Copy any `isHoliday` days into `SchoolDayRule`. The migration script must accept `--apply --tenant=<slug>` and be added to `TENANT_MIGRATIONS`.
- **Client:** keep only `getDayNameFromDate` in `calendarService`.

## 4. Audience keys

Each key has the form `<personType>@<scope>`, with class and section normalised the same way as `rbac/scope.js`:

| Segment says | Key | Viewer gets the key when |
|---|---|---|
| all parents | `parent@all` | they are a parent login |
| parents of 7B | `parent@section:7\|B` | a linked child is in 7B (via `linkedStudents.rollNumber` → Student, current session) |
| students of class 10 | `student@class:10` | their own record is in class 10 |
| house Tagore families | `parent@house:<id>` | a child has `houseId` |
| route R3 families or crew | `parent@route:<id>`, `staff@route:<id>` | child assigned to the route (TransportAssignment), or they are the vehicle's driver or conductor |
| teachers of 7B | `staff@section:7\|B` | `getAssignedSections` includes 7B |
| class teacher of 7B | `classteacher@section:7\|B` | the class teacher link resolves to them (see §9) |
| role accountant | `staff@role:accountant` | `getRoleKeys(user)` |
| all staff | `staff@all` | they are a staff login |
| a named person | `user:<UserId>` | that is their user id (never a Teacher id, because those change at carry-forward) |

- **Viewer keys** are built once per request, with at most about 4 small indexed queries, and kept for that request.
- **Recipient resolution** (`clndr/audience.js`) turns each segment's rules into User logins with batched `$in` queries. Several segments for one person collapse into one recipient whose blocks are merged. Each segment reports how many it reached and how many it couldn't (no login, or no email).
- The fixes the research found go into new resolvers, not into the existing helpers: `teachingStaff` includes drivers, `usersWithPermission` always adds admins, and `usersWithPermission` makes one query per user.
- **Who may target what:** with only `clndr.events.create`, a creator can target only their assigned sections (`buildSectionFilter`). Targeting the whole school or any audience outside their own sections needs `clndr.events.publish_wide`.

## 5. Module date sources

A module may add a `calendar` export to its module object, for example in `modules/exam/index.js`:
```js
calendar: [{ key: 'exmcl.datesheet', layer: 'exams', needs: ['exmcl_datesheets'], list: async ({ models, viewer, from, to, session }) => items }]
```
- `clndr/providers.js` collects them from `modules/index.js` and skips any whose `needs` feature is off.
- Each source has its own time limit and error handling, so one failing module doesn't break the calendar.
- An item looks like `{ id, source, layer, title, startDate, endDate | startAt, endAt, allDay, link, tone, child?, detail? }`.

| Phase | Source | Shown to |
|---|---|---|
| 1 | School days (core) | everyone, filtered by their class or wing |
| 1 | EXMCL published datesheets | students and parents of that class/section (subjects they take); subject teachers |
| 1 | CNTR duties (DutySelection + DutyAssignment) | only that functionary, plus exam coordinators (`exam.duties.read`) |
| 1 | CPITL fee dues | parents: their own child, with the amount. Staff with `cpitl.finance.view`: daily totals only |
| 1 | APPNT confirmed appointments | host and family, without the purpose |
| 1 | ACTVT events, functions, tours, sports meets | staff with `actvt.activities.read`; families once audiences are structured |
| 4 | ACDMC homework/quiz due dates · LIBRY loans (needs member FK) · ASETS maintenance/warranty · TRNST vehicle documents · TMTBL "my periods" (day view) | as listed in research §3 |

## 6. API and permissions

**Server routes** (`modules/clndr/routes.js`; school-days routes under core):
- `GET  /api/calendar/me?from&to&layers=` returns the merged list of events, module items and day info for staff.
- `GET  /api/calendar/days?from&to&class&section` returns the day map (used by other modules' clients).
- `GET/POST/PATCH /api/calendar/events`, `POST /events/:id/publish | cancel | approve`, `POST /events/preview-audience`.
- `GET/POST/PATCH/DELETE /api/school-days` (core).
- `GET  /api/portal/calendar?from&to&child=` returns the family view (all children merged, with a child label).

**`permissionCatalog.json`** (edit in `packages/shared`, then `npm run sync:shared`):
- Add module `clndr` with label "Calendar".
- **Resources:**
  - `clndr.calendar` (`read`): every role template, **including driver, conductor and nurse**.
  - `clndr.events` (`read`, `create`, `publish_wide`, `approve`, `manage`): principal and administrator get everything; class and subject teachers get `create` (own sections); office staff get `create`.
  - `core.schooldays` (`read`, `write`): `write` for principal, administrator and office staff.
- **Routes:** `/calendar` → `clndr.calendar`. The events sub-paths use `clndr.events` with their write actions. `/school-days` → `core.schooldays`.
- **Features:** `clndr_calendar` → `/calendar`, and `clndr_events`.
- **Portal:** add `calendar` to both the `parent` and `student` sections, and add it to `openSections` in `rbac/portalSections.js`.

**`tenantFeatureCatalog.json`:** add `clndr_calendar` and `clndr_events` with `module: 'clndr'`. Add model keys to `constants/moduleModelKeys.js`, put `SchoolDayRule` in core, and register the module in `modules/index.js`.

**Rollout:** run `npm run migrate:rbac` (dry run, then `--apply`), plus the legacy-calendar migration.

## 7. Delivery

**Phase 2: in-app.**
- New templates in `notifications/templates.js`: `calendar.event_published`, `calendar.event_changed`, `calendar.event_cancelled` and `calendar.reminder`.
- Each one is built per recipient from the segments that match them. The title stays short; long instructions stay on the event and the notification links to it.
- The `dedupeKey` includes the revision (`<eventId>:r<revision>:<kind>`), so "changed" notices aren't swallowed.
- Sending runs outside the HTTP request: publishing writes a `CalendarSend` row, then a job resolves recipients in chunks and calls `send()`. Recipient lists never go into event-bus payloads, because `loggingListener` prints those.
- **On edit,** the server works out what changed. Date, time, venue or a segment's instructions count as material and raise the revision. The creator then chooses who to notify: affected segments (the default), everyone, people added or removed only, or nobody. People who were removed get a cancellation.
- **Reminders:** add a `calendar` job to `notifications/scheduler.js` with the presets "6pm the day before" and "7am on the day". Both fit the hourly tick. Skip a reminder for anyone who has already responded (phase 5).
- **The scheduler gets a lease** (`dataLifecycle/lease.js`) at the same time, so two API instances never both run it.

**Phase 3: email (no new paid service).**
- **Two senders, chosen per school:**
  1. **The school's own email (preferred).** In Settings → Email, a school enters its SMTP host, port, username, app password and from name. A "Send test email" button checks them. The password is stored encrypted with a key from env (`MAIL_CREDENTIALS_KEY`), and the API never returns it. Mail goes From the school's own address, uses the school's own sending limit, and replies reach the school.
  2. **Fallback for schools without their own email:** the Hostinger mailbox `events@capabble.cloud` (env `MAIL_EVENTS_*`). It sends From `"<School name> via Capabble" <events@capabble.cloud>` with Reply-To `SchoolProfile.email`.
- **`no-reply@capabble.cloud` sends only login codes, password resets, invites and billing.** It never carries event mail, so its daily limit can't run out.
- **Fewer emails:**
  - Everything shows in-app.
  - Email goes only for segments marked "also email", for cancellations and changes to those segments, and in a morning digest (one email per person per day that lists the day's items).
  - Each school gets a fair daily share of the fallback mailbox (`MAIL_EVENTS_DAILY_CAP_PER_TENANT`). Anything over it stays in-app and shows as "not emailed (daily limit)" in the send report.
- **Headers and calendar file:** `List-Unsubscribe` plus `List-Unsubscribe-Post: One-Click`, pointing to a signed unsubscribe link. Attach an `.ics` file generated with `ical-generator`: `METHOD:PUBLISH` for announcements, `METHOD:CANCEL` with the same UID and a higher SEQUENCE for cancellations, and no other attachments.
- **`MailOutbox` and worker:** every email is a row with status `queued`, `sent`, `failed`, `suppressed` or `capped`. A leased worker sends through a pooled transport for each sender, retries with backoff, and applies the caps. A hard SMTP rejection marks that address bad and adds it to a suppression list.
- **Template:** a `calendarEvent` email in `mail/templates.js`, with a sample in `samples.js`.
- **Preferences:** a user can turn off email for each category of non-critical item. The event author can mark an item `critical`, which overrides that.
- **Ops (now):** create the `events@capabble.cloud` mailbox, and confirm SPF, DKIM and DMARC for `capabble.cloud` in Hostinger.
- **Later, only if volume needs it:** add a second fallback mailbox, or a paid sending service (e.g. Amazon SES). Because every email goes through the outbox, that is a new transport and a config change, not a rewrite.

**Later:** web push (`workbox.importScripts` plus a `PushSubscription` model, sent after `insertRows`), a morning digest, quiet hours, and WhatsApp utility templates or DLT SMS as escalation channels.

## 8. UI

**Kit first.** Add `Calendar` (month grid) and `DatePicker` to `client/src/components/ui`, built on the existing `.cb-cal` / `.cb-datepicker` CSS.
- Document them in `DESIGN.md` and bump its version line.
- Layers get fixed colour tokens plus an icon or label, so colour is never the only cue.
- The grid is navigable by keyboard, marks today with `aria-current="date"`, and shows "+N more" when a day overflows.

**Pages:**
- **`/calendar` (staff).**
  - Views: month (default on desktop), agenda (default on phones), and a day panel.
  - Layer toggles, saved per user in localStorage.
  - A "New event" button for creators.
  - Tapping an item opens details: the shared fields plus "Your part" (the viewer's segment blocks) and a link to the module for module items.
- **Event composer** (a Sheet/Dialog through the shared portal `Modal`, per the overlay rules):
  - Steps: Basics → Who's concerned (segment builder) → Notify and schedule → Review.
  - The segment builder offers presets: Parents of…, Students of…, Teachers of…, Class teachers of…, Role…, Route…, House…, People….
  - The audience preview shows counts per segment and by kind, people who match more than one segment, and **people who can't be reached**, with the list.
  - Publish options: save draft, schedule, publish (or "Send for approval").
- **School days settings** (Settings → School days):
  - The weekly-off rule (e.g. Sunday plus 2nd and 4th Saturday).
  - A holiday list with add, import from CSV, and copy from the last session.
  - Closures, each with authority, order number, classes and mode.
  - Half days.
  - "Announce this" creates a linked event.

**Widgets:**
- **Staff home:** replace the empty "Today's schedule" and "Academic calendar · today" cards in `PrincipalDesk.tsx` with `CalendarAgendaCard` (today + next 7 days, plus a day-type chip).
- **Crew screen:** add the same card to `/trnst/crew` for drivers and conductors.
- **Portal:** add an "Upcoming" card to `PortalOverview`, and a `PortalCalendar` page with a chip filter for each child.

**Polling:** no new poll. The calendar uses React Query with `staleTime` and refetches on focus. The bell's 10 s unread poll stays the only live signal.

## 9. Work on other modules (in their own phases)

| Area | Change | Phase |
|---|---|---|
| Time handling | `server/src/utils/schoolDate.js`: `dateKey(date)`, `startOfDay(key)`, `sessionLabelFor(key)` in the tenant zone. Calendar code uses only these; other modules move to them as they're touched. | 1 |
| EXMCL | Add the Publish action to `ExmclDatesheets.tsx` (`datesheetService.publish` already exists) and emit `exam:datesheet:published` | 1 |
| Class teacher | Add a `classTeacher` reference (User id) per section; TMTBL `incharge` is a name string, so add a section → class teacher mapping in core settings | 1 |
| ATTND | The register reads `schoolDays.dayInfo`: no register expected on holidays, and working-day counts use school days. `StudentAttendanceDay` stays for per-class overrides. | 4 |
| CPITL | Effective due date (setting: "due on a holiday moves to the next working day") used by reminders, the portal and `computeLateFee`. Stored `dueDate` isn't changed. Payroll loss-of-pay skips holidays. | 4 |
| APPNT | `buildSlots` closes slots on non-working days; host busy-time includes CNTR duties | 4 |
| TMTBL | `getTeacherBusyPeriods` returns nothing on non-working days; half days cut periods after `halfDay.endTime`. Fix matching of paired teachers ("A/B"). | 4 |
| TRNST | A closure or half-day event notifies the crew and families on the affected routes | 4 |
| ACDMC / LIBRY | Due-date defaults skip non-working days | 4 |
| ACTVT | Migrate `ActivityEvent`, `ActivityFunction`, `ActivityTour` and `ActivitySportsMeet` into `CalendarEvent` (with an adapter for ActvtSports), or keep them as a date source. Decide in phase 4. | 4 |

## 10. Phases

Each phase can ship on its own and is usable when it lands.

**Phase 0 — groundwork (small)**
- [x] Reminder scheduler starts on EC2 (`45e48f5`)
- [ ] `schoolDate.js` utilities and `SchoolProfile.timeZone`; `AcademicSession.startDate/endDate`
- [ ] Remove the legacy Calendar and migrate its holidays (`TENANT_MIGRATIONS`)
- [ ] Create the `events@capabble.cloud` mailbox and check SPF, DKIM and DMARC for `capabble.cloud` (ops)

**Phase 1 — see it (read-only calendar everywhere)**
- `SchoolDayRule`, its service and the settings page
- Kit `Calendar` and `DatePicker` components
- `/api/calendar/me`, `/api/calendar/days`, `/api/portal/calendar`
- The source registry, plus the phase-1 sources (school days, EXMCL, CNTR duties, CPITL dues, APPNT, ACTVT)
- The `/calendar` page, the home, crew and portal cards, and the permission and feature catalog entries
- The datesheet publish button and the class teacher link

**Phase 2 — events and segments, notified in-app**
- `CalendarEvent`, the audience keys and resolvers, and the composer with audience preview
- Publish, edit (with the diff and choice of who to notify), cancel, drafts, scheduled publish and optional approval
- The in-app templates, the `CalendarSend` audit, and reminders with a lease on the scheduler

**Phase 3 — email**
- School SMTP settings (encrypted, with a test send), the `events@` fallback transport, `MailOutbox` with its worker, caps and suppression
- The event email template with `.ics` PUBLISH/CANCEL, List-Unsubscribe, and per-category email preferences

**Phase 4 — school days drive the modules**
- The ATTND, CPITL, APPNT, TMTBL, TRNST, ACDMC and LIBRY changes in §9
- The ACTVT decision
- Further sources: ACDMC, LIBRY, ASETS, TRNST documents, and TMTBL periods in the day view

**Phase 5 — responses**
- Acknowledge, RSVP and per-child consent, which need a narrow write exception in the portal: `POST /portal/calendar/:id/respond`
- The response tracker with "remind pending"
- A PTM day linked to APPNT slots
- Consent combined with a CPITL fee

**Phase 6 — reach**
- A secret ICS feed for each user, web push, the digest and quiet hours
- A library of observance days and state holiday templates
- A printable year planner
- WhatsApp and SMS escalation

## 11. Tests (by phase)

- **Phase 1:**
  - The route coverage test passes with the new prefixes.
  - School days: weekly-off "2nd and 4th Saturday" across month boundaries; a closure for some classes only; the IST boundary at 00:00–05:30; the session boundary on 1 April.
  - A source fails soft when its module is off.
  - The portal never returns another family's dues or staff-only items.
- **Phase 2:**
  - Viewer keys for a parent with two children in different sections, and for a teacher who is also class teacher.
  - Segment blocks merge for a person in several segments.
  - A `fyi`/`silent` segment shows on the calendar but doesn't notify.
  - The `dedupeKey` revision makes a "changed" notice arrive.
  - Creator scope is limited to their assigned sections.
  - Recurrence expansion with exDates and `until`.
- **Phase 3:**
  - Outbox idempotency on retry.
  - The suppression list is respected.
  - The `.ics` UID and SEQUENCE stay stable across updates, and CANCEL is generated correctly.
  - The per-tenant cap queues the overflow.
  - Auth mail is never queued behind a broadcast or sent from `events@`.
  - A school's SMTP password is never returned by the API.

## 12. Decisions (settled 22 Oct 2026)

1. **Name:** Calendar in the app, module code `CLNDR`, route `/calendar`.
2. **Packaging:** on by default for every school. Creating events has its own feature key (`clndr_events`), also on by default, so it can be priced separately later.
3. **Creators:** principal, administrator and office staff can create events for anyone. Class and subject teachers can create them only for their own sections. Teacher events that reach parents wait for the principal's approval. Schools can change this in Roles.
4. **Email:** no new paid service. A school can connect its own email (SMTP); otherwise event mail goes from the Hostinger mailbox `events@capabble.cloud`. `no-reply@` is kept for login, reset, invite and billing mail (see §7).
5. **Activities events:** stay in ACTVT and appear read-only on the Calendar. Merging them into Calendar events is decided in phase 4.

## 13. Build notes (23 Oct 2026)

Built and committed on `stage` (not pushed): phases 0–6 as above, with these differences and gaps.

**Changed from the plan**
- Event times are stored as school-day keys plus local `HH:MM` (not UTC instants): simpler for one-zone schools; the `.ics` output carries the zone.
- Email uses no paid service (decision 4): the school's own SMTP or `events@capabble.cloud`, through a per-school outbox.
- Recurrence edits support "all dates" and "cancel one date"; "this and following" is not built.
- Approval: a teacher's material change to a published family event goes back to the principal (the event is hidden until approved again).

**Left for later**
- Attendance day-wise matrix views (`AttndDaywiseMatrix`, `AttndStaffDaywiseMatrix`) still use their own holiday toggles; the month registers, dashboard and portal use School days.
- Transport has no trip schedule to change; closures reach crews and families through the announcement (all staff + families of the classes).
- Consent combined with a CPITL fee, web push, a daily digest, quiet hours, WhatsApp/SMS, a printable year planner, saved ad-hoc groups, CPD hour tracking, and class teacher as a stored reference (today: timetable in-charge or class_teacher role + assigned sections).
- Board exam days (CBSE datesheet) and LIBRY/ASETS/TRNST-document/ACDMC items are not calendar sources yet (the registry makes each one a small `calendar.js`).

**To roll out**
- `npm run migrate:rbac` (dry run, then `-- --apply`) so existing tenants' roles pick up the calendar permissions; `npm run migrate:calendar` (dry run, then `-- --apply`) to copy any old holidays.
- Create `events@capabble.cloud`, set `MAIL_EVENTS_*` and `MAIL_CREDENTIALS_KEY` on the server.
