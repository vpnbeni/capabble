# Universal calendar — research before planning

Research date: 22 Oct 2026. Inputs: 7 codebase readers (one per module group plus foundations, delivery and audience), 6 market-research angles, a fact-check on every report, and 5 follow-ups on gaps a completeness critic found. Claims marked *unverified* could not be confirmed from a primary source.

The idea: one calendar on every dashboard (staff and family portal). Each person sees only what concerns them, so on the same day the principal, a class teacher, a driver and a parent see different things. Admins create events, configure who is concerned with per-group instructions ("bifurcation"), and the system notifies those people in-app and by email.

---

## 1. Headline findings

1. **No competitor does "one event, different instructions per audience".** Fedena, Toddle, ParentSquare, Edsby, Blackbaud, Remind and ClassDojo all use one message per post sent to the selected groups. Indian schools do this by hand today (circular for parents, a separate staff note, a WhatsApp message to drivers). This is Capabble's clearest differentiator, together with roles nobody else serves (driver, conductor, nurse, accountant, invigilator).
2. **The best products don't author a calendar per role. They compute it from membership.** Blackbaud "persona" calendars, Veracross "household" calendars and Edsby personal calendars are built from the user's classes, groups and children, and module data flows in automatically. Capabble should do the same: events carry audience rules, and "my calendar" is resolved per viewer at read time.
3. **Capabble has strong delivery plumbing but no calendar.** In-app notifications are mature: per-recipient templates, dedupe keys, staff/family gating, and an hourly reminder scheduler. Email is one-off and transactional, and there is no event entity, no audience model, no holiday master, no session dates and no calendar component.
4. **Email at school scale needs a new pipe before launch.** Every tenant shares one Hostinger mailbox (`no-reply@capabble.cloud`), capped at 1,000–3,000 emails a day. One whole-school event to 2,000 parents could use up the platform's quota and block OTP and password-reset mail for every school.
5. **Live bug, independent of this feature:** the notification scheduler (fee due, meeting tomorrow, maintenance due) starts only in the Vercel branch of [server.js:33](../../server/src/server.js). Nothing starts it on EC2, so those reminders aren't running in production today. Verified by hand.

---

## 2. What exists in the codebase today

### Reusable
| Piece | Where | Use for the calendar |
|---|---|---|
| In-app notifications (one row per recipient, unique `recipient+dedupeKey`, 180-day TTL, title ≤200 chars, body ≤1,000) | `server/src/notifications/send.js`, `models/Notification.js` | Event published, changed or cancelled notices. Copy is built per recipient, so per-group text already fits. |
| Recipient helpers (by user id, teacher, roll number → families, role, permission, administrators) | `notifications/recipients.js` | Basis for resolving audiences. Needs new resolvers (class teacher, subject teachers of a section, route crew, house, club). |
| Hourly reminder scheduler with dedupe | `notifications/scheduler.js` | "Day before" and "morning of" reminders. The appointment key pattern `${id}:reminder:${date}` fits directly. "1 hour before" needs a finer tick. |
| Event bus (listeners keep the request's academic session) | `server/src/events/*` | Module → calendar feeds and calendar → module reactions. |
| Branded email templates and mailer | `server/src/mail/*`, `utils/mailer.js` | Event email template. Needs a queue, an outbox and a new provider (see §6). |
| Job lease (once-per-day, single instance) | `modules/dataLifecycle/lease.js` | Pattern for a durable email-outbox worker. |
| Notification bell (staff and portal, polls every 10 s) | `client/src/hooks/useNotifications.ts` | Unchanged. Calendar badges can share this poll. |
| Calendar CSS (`.cb-cal`, `.cb-datepicker`: holiday, today, tone dots, legend) | `client/src/styles/capabble` components.css | Styles are in the kit already; only the TSX component is missing. `date-fns` is installed but unused. |
| Module registry `{key, mountRoutes, models, listeners}` | `server/src/modules/index.js` | Add an optional `calendar` provider export per module. The calendar asks only active modules, so modules stay independent. |
| Dashboard placeholders | `client/src/components/home/PrincipalDesk.tsx` ("Today's schedule" card, always empty; "Academic calendar · today", hard-codes `isHoliday:false`) | Natural mount points for the calendar widget. |

### Dead or broken — do not build on
- **Legacy `Calendar` model** (`models/Calendar.js`): one document per year with an `isHoliday` flag per day. Its route is unmounted ("Temporarily disabled for debugging" in `app.js`) and the seeder is commented out. `year` is unique while the session plugin filters queries, so the first access in a new session fails with E11000. Replace it rather than revive it; any data migration goes in `TENANT_MIGRATIONS`.
- **Activities board calendar** (`/actvt/calendar` → `ActvtBoard.tsx`, `ActivityEvent`): the only real event grid. All fields are strings, the in-charge and club members are free text, the audience is only school/house/club, there are no notifications and no portal access. Every staff role with `actvt.activities.read` sees everything. Functions, tours and sports meets are separate collections that don't appear in the grid.

### Gaps that matter for planning
- **Holidays live in six places that disagree:** the dead Calendar model; `StudentAttendanceDay` (`non-academic`, per class-section, set from the register); staff-register holiday toggles that are never saved; a per-browser `sundayHoliday` localStorage flag; Sunday hard-coded in the portal and attendance dashboard; and Saturday+Sunday in PrincipalDesk. The timetable runs Monday–Saturday.
- **`AcademicSession` is only a label** (`2025-2026`, April–March assumed). It has no start/end dates, terms or vacations, and `labelFromDate` uses server-local time.
- **No tenant timezone.** IST is hand-rolled in a few places, with about 55 server and 29 client `toISOString().slice(0,10)` date keys. Dates are stored as UTC-midnight `Date`, `'YYYY-MM-DD'` strings and `'DD.MM.YYYY'` (Form66). An aggregating calendar will put items on the wrong day unless everything is normalised to IST date keys.
- **No calendar component in the UI kit** (DESIGN.md says use `TextField type="date"` until it is ported). There is no calendar portal section, no `/calendar` route rule in `permissionCatalog.json`, and drivers and conductors lack `core.dashboard.read` (they land on `/trnst/crew`).
- **Notifications have no email channel router, no per-user preferences, no quiet hours, no digests, no scheduled publish and no retract/supersede.** `readAt` is polluted by "mark all read", so it can't serve as acknowledgement.

---

## 3. Integration aspects, module by module

Each module integrates in two directions: **feed** (its dates show on the calendar, read-only and edited in the module) and **driven** (a calendar holiday, closure or event should change the module's behaviour). Every feed must check the tenant's active modules and fail soft.

### CNTR — board exam centre
| Feed | Who sees it | Today |
|---|---|---|
| Board exam days (`CBSEDatesheet.entries`: date, slot, class, subject), filtered to this centre's candidate subjects | Exam cell and principal; everyone else sees "board exam day, campus restricted" | Shown on the CNTR dashboard only |
| Functionary duties (`DutySelection`: CS, DCS, observer, invigilator, ASI, clerk, Class IV per date) | **Only that teacher** and the exam coordinator | No notification for these duty types |
| Room invigilation (`DutyAssignment`) | That invigilator | `exams.duty_assigned`, in-app only, no reminder, no "removed" notice |
| Answer-sheet dispatch (`AnswerSheetDispatch`) | Exam cell | Model exists but nothing reads or writes it |

Driven: exam days should be an *overlay* with per-class opt-in that suspends the timetable and marks rooms busy, never a hard block on attendance. Appointment hosts should be busy during their duties; today `getTeacherBusyPeriods` ignores them. Privacy: board candidates and outside functionaries must never appear on family calendars. CBSE counts board duty towards teachers' 50 CPD hours, so duties can feed a CPD tracker.

### EXMCL — internal exams
- **Feed:** `DateSheet` papers (class, section, subject, date, time, instructions) go to students and parents of that class-section (filtered to subjects the student takes) and to subject teachers. Results publication goes to families. Circulars go to their audience.
- **Gaps:** `ExamDefinition` has no dates (exam window, marks-entry deadline, result date, PTM). Internal datesheets are never published from the UI: the publish endpoint exists but no page calls it. The portal has no exams or datesheet section, so parents can't see exam dates anywhere today. Per-paper instructions exist in the schema but the UI sends them empty. `ExamCircular` notifies every family and no staff, with no audience. The admit-card generator picks the latest datesheet by class only; don't reuse that logic.
- **Value:** exam schedules and results are among the highest-value parent feeds.

### TMTBL — timetable
- **Feed:** "my periods today" for teachers (no such view exists anywhere) and the class timetable for students. Show these as a day-view layer, not as month noise.
- **Driven (most important):** the timetable is a weekday grid with no per-date overrides, effective dates or half-day bell schedules. A calendar holiday, half day, exam day or event should suspend or replace periods for the targeted classes, and drive substitutions. `Substitution.tsx` isn't persisted today.
- **Risk:** the grid stores teacher *names*. Busy-period lookups miss parallel cells ("A/B"), and renames silently break matching. The class teacher is a name string in `TimetableState.classes[].incharge`.

### ATTND — attendance
- **Driven:** attendance should read working days from the calendar, so there are no registers expected on holidays and working-day counts are correct. Payroll counts absences as loss of pay without checking holidays, so a holiday declared later could mis-pay staff.
- **Feed:** a "register not yet taken" nudge for class teachers. Staff absence should flag their calendar duties as needing cover.
- **Caution:** attendance saves are delete-then-insert per month. Don't write holidays into `StudentAttendanceDay`; keep the calendar as a separate source the register reads. There is no staff leave model, and `HD` (half day) is in the enum but never written.

### ACDMC — academics
- **Feed:** homework, assignment and quiz due dates go to students and parents of the section and to the assigning teacher. Lesson plans and curriculum targets go to the teacher only.
- **Gaps:** no events or notifications at all, and no portal academics section. Homework defaults to "tomorrow" without skipping Sundays or holidays; it should use the working-day master.

### STDNT / core
- **Feed:** birthdays (`Student.dateOfBirth`; `Teacher.dateOfBirth` and `dateOfJoining`) should be opt-in, because they are personal data. Admission and session milestones are for admins.
- **Audience source:** class, section, gender, subjects, house, transport, linked parents.

### CPITL — finance
| Feed | Who sees it | Today |
|---|---|---|
| Fee instalment due dates (`FeeDemand`, per student) | **Only that child's parents**, with the amount. Staff with `cpitl.finance.view` see totals, never lists. | `fees.due_soon` / `fees.overdue` in-app only, and not running on EC2 (see §1.5) |
| Late-fee start date | Parents with dues | Not built |
| Payroll run / pay day, statutory dates (PF/ESI/TDS/PT) | Accountant and principal only; net pay visible only to the payee | Not modelled |
| Electricity bills, infra milestones, budgets | Finance viewers | Milestones have no owner |
| Trip or activity fees linked to consent | Parents of participants | Not built (see responses, §5) |

Driven: add a tenant setting such as "a due date on a holiday moves to the next working day" and compute an *effective* due date when it is read. Never rewrite stored `FeeDemand.dueDate`, because paid demands are frozen. Never shift external dues (electricity bills, Capabble invoices). Student logins can't see fees today, and that is correct.

### ASETS — assets
- **Feed:** maintenance due, warranty/AMC expiry, audits and expected returns go to the asset manager or custodian only.
- **Gaps:** the UI can't set `nextDueDate`, `isPreventive`, warranty end, expected return or custodian, so the existing `assets.maintenance_due` reminder almost never fires. `warrantyExpiry`, `auditDue` and `lowStock` switches are stored but no job reads them.

### LIBRY — library
- **Feed:** loan due dates go to the borrower (student or teacher); reservations ready go to the borrower.
- **Blocker:** `LibraryMember.memberId` is free text with no link to Student, Teacher or User. A real foreign key is needed before showing loans on family calendars, or one child's overdue books could show for another. There are no events, listeners or notifications. Due dates should skip closed days.

### APPNT — appointments
- **Feed:** confirmed appointments go to host and family. Notifications and email already exist, so calendar items must be *display-only* to avoid double-notifying.
- **Driven:** slot building ignores school holidays and events, so hosts block dates one by one. The calendar should close slots on closure days.
- **New:** a **PTM day** (bulk parent-teacher meeting) doesn't exist. Model it as a calendar event whose parent segment links to APPNT slot booking.
- **Privacy:** never expose `purpose` or outcome notes. Parents only ever see open or busy.

### TRNST — transport
- **Feed:** vehicle insurance and fitness expiry go to the transport in-charge; today this is only a client-side 30-day banner with no notification. PUC, permit and driver-licence dates don't exist.
- **Driven:** trips are ad hoc, with no service-day calendar, so "no bus tomorrow" or "early dismissal at 12:30" can't be expressed. A closure or half-day event should notify the drivers, conductors and parents of affected routes and change the trip schedule.
- **Audience source:** route, stop and shift (`TransportAssignment`) and vehicle crew (`driverId`/`conductorId`) are structured and resolvable. Route-based targeting is especially valuable in India.

### ACTVT — activities
- **Absorb or adapt:** `ActivityEvent`, `ActivityFunction`, `ActivityTour` and `ActivitySportsMeet` overlap with universal events. Either migrate them into the calendar event model or register them as a feed. `ActvtSports` depends on Sports-type `ActivityEvent`s, so a migration needs an adapter.
- **Audience source:** houses resolve (`Student.houseId`, `ActivityHouse.teachers[].teacherId`). Clubs, teams, tour participants and in-charges are free text and **cannot be targeted** until they become references.
- **Big days** (annual day, sports day) are the prime bifurcation case: participants get the rehearsal schedule, parents of participants get dress and arrival instructions, all parents get an invite, and staff get duty roles.

### MDCL — medical
- **Feed:** health camps, vaccination and deworming drives (consent plus a "breakfast before the tablet" instruction for parents, duty for the nurse and teachers) and mop-up days for absentees.
- **Gaps:** no check-up or vaccination model. `MedicalCase.studentName` is free text with no `studentId`. Medical details must never enter feeds.

### STAAF / ALMNI / FDBCK
- **STAAF:** recruitment interviews live only in browser localStorage with sample data. There is no leave model. Staff duties (gate, bus, assembly) and CPD hours belong on personal calendars.
- **ALMNI:** has no logins, so alumni reunions can only go by email.
- **Feedback/Support:** these are product tickets sent to Capabble, not school complaints. Not calendar material.

---

## 4. Who are the "concerned parties": the audience model

### Dimensions that resolve to real logins today
user kind (staff/parent/student) · role (built-in or custom) · permission · class · section · gender · subjects taken · house (students, house teachers, council) · student-council posts · bus route / stop / shift · vehicle crew · appointment hosts · exam-duty functionaries · payroll staff · fee status · named individuals · all staff · all families.

Families are reached only through the admission number (`Student.rollNumber` → `User.linkedStudents.rollNumber`). Staff are reached only through `Teacher._id` → `User.teacher`. `Teacher` holds every kind of staff, including drivers and peons.

### Weak or missing (needs work before or during the build)
- **Class teacher** is a name string in the timetable, and `User.assignedSections` doesn't separate class teacher from subject teacher.
- **Departments** are free text; there is no HOD.
- **Staff groups and org bands** are computed only on the client. There is no saved group or distribution-list entity (for example "Annual Day committee").
- **Clubs, teams and tour participants** are free text. There are no stream, hostel or wing fields. There is no reverse lookup from a section to its staff.
- **Unreachable people:** staff without a login, students without `guardianEmail` (no parent login), a second parent who needs a manual login, username-only student logins, and placeholder `*.local` emails.
- A teacher who is also a parent needs two logins (email is unique across kinds), so one merged calendar isn't possible.
- **`User` has no phone field**, though `Student.guardianPhone` and `Teacher.mobileNo` are required. These are the SMS/WhatsApp contacts for later.
- **Recipient helper caveats:** `usersWithPermission` always includes administrators, `teachingStaff` returns every staff login (including drivers), and `usersWithPermission` is N+1 for custom roles. Don't reuse these as-is.

### Recommended model (market best practice plus code fit)
An **event** has shared core fields (title, date/time or range, venue, category, attachments) plus a list of **audience segments**. Each segment is:

```
{ label, personTypes × scopes  (e.g. parents × section 7B; staff × role driver; staff × route R3),
  include / exclude, eventRole (in-charge | on duty | participant | attendee | FYI),
  instructions (+ optional second language), attachments,
  notifyLevel (push+email now | in-app only | digest | silent),
  response (none | acknowledge | RSVP | consent per child (+fee) | slot sign-up),
  reminders }
```

- **Storage: hybrid.** Store segment rules plus a flattened `targetKeys[]` (`section:10|A`, `role:accountant`, `route:<id>`, `house:<id>`, `user:<id>`, `all:family`). "My calendar" works out the viewer's own keys per request (about 1–4 small indexed queries) and runs one multikey query. Recipient *lists* are resolved only when sending (publish, edit, reminder) and logged as an audit snapshot.
- **Membership is live for display and a snapshot for notifications.** If a student changes section, the event moves with them, and they can optionally get a "you've been added" notice if the event hasn't started yet.
- **People in several segments** (a parent with two children, a teacher who is also class teacher of 7B) get **one** notification with labelled blocks: "As class teacher of 7B…", "For Aarav (5A)…".
- **Visibility is separate from notification:** an event can be visible to all staff while only the duty segment gets pinged. A sensitivity level (public / staff-only / private) means staff-only blocks never reach the portal, whatever the audience. Filtering happens on the server, per viewer and per linked child.
- **Recipient preview before publishing:** counts per segment and by kind ("212 parents, 14 teachers, 2 drivers"), people in several segments, and **unreachable** people (no login or no email) so the school knows when to fall back to paper or SMS. Few products have this; it's a differentiator.
- **What creators can target follows RBAC:** a `calendar.events.create` permission limited by the existing `assigned` scope (`buildSectionFilter`), plus a separate grant for whole-school or family-wide publishing.
- **Optional approval** above a threshold (a teacher posting to parents outside their sections, or any whole-school event): draft → pending approval → scheduled → published. This matches the Indian "numbered circular signed by the principal" practice; add a circular-number field.
- **Avoid sensitive filters:** keep `category`, `religion`, `medicalInfo`, fee status and salary out of the audience picker.

---

## 5. Market research summary

### Indian ERPs (Fedena, Toddle, Entab, Teachmint, MyClassboard, Edunext, Camu, SchoolKnot, …)
- Targeting means picking class, section or batch (and department for staff), with **one message** for all. Holidays are an "Is holiday?" checkbox on an event (Fedena) or an admin-only type targeting grades (Toddle).
- Module events (exams, fees) appear but are edited only in their module (Fedena).
- Toddle has the most mature flow: admin-only event types; audiences of all, staff, students or families; grade, class or custom lists; up to 3 reminders over email, in-app or push; and a one-time `.ics` link. Toddle announcements have read receipts.
- Channel mix buyers expect: app push, SMS (DLT), WhatsApp and email. Entab advertises all four, and WhatsApp is what parents actually read.
- **Pain today:** the printed diary or almanac plus class WhatsApp groups mean floods, overwhelmed teachers, no proof a parent saw a message, and "we weren't informed" complaints. **Acknowledgement as proof of notice** is a selling point.
- Reported weak spots: one product shows only one child's messages to parents with two children (Teachmint reviews); nobody serves drivers, conductors, nurses or accountants; and separate academic, sports and exam calendars cause clashes.
- Vendor feature claims for Class ON and Edumerge come from marketing pages only.

### Global K-12 (Blackbaud, Veracross, PowerSchool/Schoology, Finalsite, ParentSquare, Edsby, Arbor, Compass, iSAMS, ManageBac, Google Classroom, Teams)
- **Calendars are derived from membership.** A parent's view merges all children, with a child filter.
- Each source or type has a fixed colour with layer toggles (Arbor has a fixed legend).
- **Actionable events:** ParentSquare has RSVP with headcount, volunteer slots, permission slips with e-signature and appointment sign-ups. Compass and Arbor combine consent and payment for trips. Edsby's interview booking writes to both calendars.
- **Notification control:** ParentSquare offers Off / Instant / Digest (an evening digest), and urgent messages override preferences. The digest holds only non-time-sensitive posts; whether each channel can be set separately is unverified.
- **Pitfalls seen:**
  - External ICS sync lags (Google about 12–24 h, Veracross up to 12 h), so last-minute changes must go as notifications.
  - Opt-in email gets very low uptake (one Blackbaud school reported under 25%), so default to on with a digest.
  - Arbor allows one location per event, and groups can't be removed from an event.
  - Some consents and payments needed a browser rather than the app.

### Calendar standards (RFC 5545, Google, Outlook, Graph, CalDAV)
- Store a series **once** (stable UID, a SEQUENCE that goes up on each change, RRULE plus EXDATE/RDATE) and expand it per requested range on the server (rrule.js). Support only the RRULE subset the UI produces, including `BYDAY=2SA,4SA` for "2nd and 4th Saturday". Recurrences end at the session end (31 March) by default.
- Edit choices: *this / this and following / all*. "This and following" ends the old series and starts a new one.
- **All-day events are date-only values with an exclusive end, never midnight timestamps.** Timed events are stored in UTC plus `Asia/Kolkata`. India has no DST, but the half-hour offset breaks naive code.
- **Email invites:** `METHOD:PUBLISH` for announcements and `METHOD:CANCEL` with the same UID and a higher SEQUENCE for cancellations. Put no other attachments on invite emails. Nodemailer doesn't generate ICS, so add `ical-generator` or `ics`.
- **Per-user secret ICS feed** (resettable, revoked on deactivation) is v1.1. Google can't add a subscription from its Android app, so for Indian parents (mostly Android + Gmail) the in-app calendar plus a one-tap "Add to calendar" matters more.
- **Views:** month with "+N more", an agenda list (the default on phones), and a day panel. Later: week/day grid and a printable year planner, which Indian schools publish.
- Accessibility: a keyboard-navigable grid, `aria-current="date"`, and colour never the only cue.
- **Avoid two-way sync (CalDAV, Graph writes) in v1.**

### Delivery (Novu, Knock, Courier, OneSignal, MagicBell, email providers, India rules)
- **Model to copy in-house:** trigger → workflow → per-recipient run, with channel steps plus delay, digest, throttle and branch steps. Preferences are by category × channel, and "critical" ignores opt-outs. Idempotency keys look like `eventId:revision:recipient:reminderSlot`. Pending reminders are cancelled when an event is edited or cancelled.
  - Novu is MIT-licensed if self-hosting is ever wanted.
  - Its cloud has no India region.
  - Knock and Novu audience rules can't express multi-tenant school data, so resolve audiences in Capabble.
- **Default reminders:** at publish, 6 pm the day before (all-day events) or 24 h before, and 7 am on the day. Skip a reminder if the person has already acknowledged.
- **Change notices** go only to affected segments, show old → new values, and stay silent for cosmetic edits. Cancellation sends a notice plus an `.ics` CANCEL.
- **Quiet hours:** default 9 pm–6:30 am for push, SMS and WhatsApp. Emergency events (for example "school closed tomorrow") bypass them.
- **Digest:** a morning "today at school" email for parents and a weekly summary for staff. Low-priority module items (library due, maintenance) go into the digest.
- **Acknowledgement:** keep *delivered*, *seen in-app*, *opened email* and *acknowledged* as separate states. Email opens are unreliable (image blocking, privacy proxies), so only an explicit Acknowledge counts.
- **Email provider (recommended): Amazon SES in Mumbai (ap-south-1).**
  - It has an SMTP endpoint in the same region and account as the existing EC2, and works with nodemailer.
  - Cost is about $0.10 per 1,000 (à la carte).
  - SES tenant management can isolate each school's reputation and pause one school instead of the account.
  - Bounces and complaints come through SNS/EventBridge. Gmail doesn't send complaints to SES, so use Postmaster Tools.
  - Hyderabad has no SMTP endpoint. New accounts start in a sandbox (200 a day), and AWS promises an initial response to production access within 96 hours, not approval.
  - Postmark, Resend and Mailgun have no India region.
- **Sender identity:**
  - Event mail: `"<School name> via Capabble" <events@notify.capabble.cloud>`, Reply-To the school office, with List-Unsubscribe and one-click unsubscribe.
  - Auth and billing mail: a separate stream and configuration set, never queued behind broadcasts.
  - Gmail counts the 5,000-a-day bulk threshold per *primary domain* (subdomains roll up), and bulk status is permanent. That brings SPF + DKIM + DMARC, alignment, one-click unsubscribe and a spam rate below 0.3%. Yahoo has the same rules.
- **SMS (later):** TRAI DLT applies. Register the entity, headers and **each template** with variables, and URLs must be whitelisted (enforced since 1 Oct 2024). Free-text per-segment instructions can't go by SMS, so SMS must be a fixed template plus a link. School notices most plausibly fit "service implicit". Fedena's 160 characters is one billed unit, not a cap.
- **WhatsApp (later):**
  - Since 1 Jul 2025 Meta bills **per delivered template message**, not per conversation.
  - India's marketing rate rose on 1 Jan 2026, and utility rates have volume tiers. Reported rates of about ₹0.115 utility and ₹0.86 marketing are unverified against Meta's rate card, and BSPs add about 10–30%.
  - From 1 Oct 2026, service messages beyond 1,000 per number per month are billable.
  - Opt-in is required, recorded per guardian and per category.
  - Read receipts depend on the recipient's privacy settings, so a WhatsApp "read" is not acknowledgement.
- **Web push:** works well on Android Chrome. On iOS it needs the PWA added to the Home Screen and a tap to allow, and a denial is hard to undo. Ask only after an explicit "Get alerts on this phone" tap.
- **Escalation ladder:** in-app + email first. For critical or acknowledgement-required items still unread after N hours, escalate to push, then later WhatsApp or SMS. This keeps per-message costs low.
- **DPDP (not legal advice):**
  - Most of the Act's operative sections (notice, consent, children's data) apply from about 13 May 2027. Consent-manager provisions come in Nov 2026.
  - Rule 10 requires verifiable parental consent for children's data.
  - The educational-institution exemption (Fourth Schedule) is **narrow and conditional**: only tracking or monitoring needed for educational activities or child safety. Commentators disagree on its reach; cite the official schedule before relying on it.
  - Store consent and acknowledgement records per child, and keep notification logs auditable.

### Audience UX (ParentSquare, Finalsite, Blackbaud, Edsby, Remind, Mailchimp, HubSpot, Customer.io, Knock, Exchange, Slack)
- Mature systems offer both **static (snapshot)** and **rule-based (live)** lists. Live lists differ in freshness: Exchange refreshes about every 24 h, though since mid-2026 small groups recalculate immediately; Google re-syncs group guests only for future events. Exclusions are common. A **recipient preview inside the composer is rare**, which is an opportunity.
- Tailored text elsewhere comes from per-attribute conditional content (Mailchimp merge conditions, Liquid templates), which confuses non-technical authors. Explicit **labelled segment blocks** are better.
- ParentSquare's default hides parent posts from staff. Consider auto-adding a "staff FYI" segment for the class teachers of targeted sections, so teachers know what parents were told.
- Edit storms train people to ignore notifications. On edit, show a diff and let the creator choose: everyone / affected segments / added or removed people / don't notify.

---

## 6. What goes on an Indian school calendar (content and default behaviour)

| Category | Concerns | Default behaviour |
|---|---|---|
| **Board exam days** (CBSE theory, practicals, Class 10 second exam in May, supplementary in July) | Only candidates for that subject and their parents; invigilators see their slot; everyone else sees "campus restricted" | Email + in-app at publish, day-before reminder |
| **Board compliance deadlines** (LOC regular/late/correction stages, OASIS/SARAS, sports registration) | Owners (staff) only, never students | Staff "deadline" type with stages; reminders 7 d, 2 d and same day. Store each stage separately; secondary sources mix up regular and late-fee dates. |
| **Govt data compliance** (UDISE+, APAAR ID drives) | Staff owners; parent "APAAR consent camp" only for classes with missing IDs | Weekly digest to owners |
| **Holidays** (central gazetted vs restricted, state list, school-declared, vacation; moon-dependent dates re-notified 1–2 days ahead) | Whole school, or per wing or class | Typed holiday master with a **"tentative"** flag; notify at publish and the day before. A restricted holiday is per employee, not a school closure. |
| **Sudden closure / mode change** (GRAP pollution, heatwave, rain alert, polling booth) | **Specific classes only.** GRAP orders varied: CAQM Nov 2024 put every class hybrid; DoE Jan and Dec 2025 kept 10/12 physical. Heatwave orders covered up to Class 8. Kerala rain orders excluded residential schools. | Top-priority type: authority + order number, affected classes, mode (closed/online/hybrid), exam exceptions. Overrides timetable, transport and duties; immediate notice (bypasses quiet hours). Never pre-fill an exemption. |
| **Election duty / polling booth** | Closure for families; personal "external duty" for staff, which drives substitutions and APPNT availability | Parents never see staff duty details |
| **Mandated observances** (Rashtriya Ekta Diwas 31 Oct, Vigilance Week, Constitution Day 26 Nov, Fit India School Week, Veer Baal Diwas, deworming days, …) | Staff owner gets a task; families only if the school adds instructions | Curated, editable **observance library** per session; dates editable per state (for example, the deworming August round is only in some states) |
| **Internal assessments** (periodic/unit tests, pre-boards, half-yearly, annual) | Class or section students and parents; subject teachers (paper setting, invigilation, marks-entry deadline) | Publish, a week before, a day before; result-published notice |
| **PTM** | Parents by class range (with slot); teachers ("be in your classroom") | Parents 5 days and 1 day before; APPNT slots where enabled |
| **Big days** (annual day, sports day, competitions) | Participants, parents of participants, all parents, staff with duty roles | The core bifurcation case; ACTVT supplies participants |
| **Trips, bagless days** (NEP: 10 bagless days, Classes 6–8) | Parents (consent), teachers (escort), transport (run), accounts (fee) | Consent with deadline plus reminders to non-responders |
| **Health camps** (deworming, vaccination, check-ups) | Parents by age or class (consent and instructions); nurse and teacher duty | Automatic mop-up event for absentees |
| **Fee instalments** | Only families with that due, with the amount | 7 days and 1 day before, plus the late-fine date |
| **Staff duties** (gate, bus, assembly, invigilation, board duty, CPD) | Only the assigned person and their supervisor | At roster publish plus the evening before; CPD hours tracked against 50/year (25 external + 25 in-house, per secondary sources citing CBSE circulars TRG-2 and TRG-3/2025) |
| **Saturday pattern** | Whole school or per wing | Tenant rule (all working / 2nd and 4th off / all off), overridable per date; feeds TMTBL and working-day counts |
| **Admission cycle, management calendar** (for example Delhi SLFRC before 15 Jul, GM before 15 Aug) | Admin only | Milestones |

Other realities:
- Session runs April–March.
- RTE requires 200 working days (primary) and 220 (upper primary). Some states differ: Kerala cut Classes 1–5 to 200.
- Primary or pre-primary wings often run 5-day weeks while seniors run 6.
- Teachers often work on student-off Saturdays.
- No good machine-readable holiday source exists. Google's India holiday ICS has no state or gazetted tags, so ship editable per-state templates instead.
- **Dates are often published late or change** (the CBSE datesheet was still pending in Oct 2026), so "tentative" and change notifications are essential.

---

## 7. Technical constraints the plan must respect

1. **Session scoping.** The calendar event should be **tenant-global, anchored to real IST dates**, with a derived `academicSession` tag for reporting only. Don't use the session plugin on it:
   - The plugin's filter would hide events created under another session header, and the header is a sticky client value.
   - Background jobs have no session context, so module feeds must pass the session explicitly (from `labelFromDate(date)` in IST).
   - Students are one record across sessions.
   - Carry-forward gives Teachers new ids, so `User.teacher` and route, house and duty references can point at last year's record. Target people as `user:<UserId>`, never teacher ids.
2. **A school-day master replaces the six holiday stores.** It holds working, holiday (typed), vacation, weekly-off rules, half day (with bell schedule), and closure/mode change. Each is whole-school or per class or wing, with authority, order number and a tentative flag. Attendance, timetable, appointments, fees (effective due date), library, transport and the portal all read it.
3. **AcademicSession needs start/end dates and terms**, and a tenant timezone (default `Asia/Kolkata`). Normalise every feed to IST `YYYY-MM-DD` keys.
4. **Each module registers a calendar provider** through the module registry, and is queried only when active. Module items are **display-only** and keep their own notifications (APPNT, fees, duties), so the calendar doesn't double-notify. Only calendar-native events notify, unless dedupe keys are shared.
5. **Fan-out must be durable:**
   - Resolve recipients with `$in` queries and send with one `insertMany`.
   - Email goes through a per-tenant outbox with a per-recipient log (queued / sent / delivered / bounced / complained / suppressed), driven by a leased worker with rate limits and per-tenant daily caps.
   - Avoid in-memory bus listeners for bulk sends: a restart loses the rest, and a re-run double-sends.
   - Don't put recipient lists in event payloads (`loggingListener` prints them).
6. **Notifications are not the calendar's source of truth.** They expire after 180 days and are truncated at 200/1,000 characters. Long instructions live on the event; the notification links to it. Dedupe keys must include the event revision so "changed" notices aren't suppressed.
7. **RBAC:**
   - Add a `calendar` resource and a `/calendar` route rule in `permissionCatalog.json` (otherwise the route is admin-only and the route-coverage test fails).
   - Grant `core.calendar.read` to **every** role template, including driver and conductor, who lack dashboard access.
   - Add a portal `calendar` section and a `/portal/calendar` endpoint.
   - Run `npm run migrate:rbac` for existing tenants.
8. **The read-only portal needs a narrow write exception** for acknowledge, consent and RSVP, or a paper fallback.
9. **UI:** port the DatePicker/Calendar into the kit (CSS already exists), document it in DESIGN.md, use fixed category colour tokens with an icon or label, and put any drawers or sheets through the shared portal `Modal`/`Dialog` per the overlay rules.
10. **Mobile:** add web push via `generateSW` + `workbox.importScripts` (a small change) and a `PushSubscription` model, with the fan-out after `insertRows`. Clear React Query on logout (it doesn't today) before persisting any calendar data on shared family phones. Offline "next 30 days" is v2.
11. **Polling:** don't add a second poll. Piggyback on the 10 s unread-count poll or lengthen intervals; 2,000 open parent tabs is already about 200 requests per second.
12. **Data lifecycle:** any data migration (for example absorbing `ActivityEvent`) goes in `TENANT_MIGRATIONS`. New collections may hit shared-Atlas collection caps, as `appntController` already handles.

---

## 8. Suggested scope tiers (input for the plan, not the plan)

**v1 — differentiating core**
- School-day master (holidays, weekly-off rules, half days, closures by class) plus session dates and tenant timezone; attendance, timetable and appointments read it.
- Event model with audience segments, per-segment instructions, event roles, visibility vs notify level, recipient preview with unreachable counts, drafts, scheduled publish and optional approval.
- "My calendar" resolver (staff and portal, merged multi-child view), dashboard widget (today plus next 7 days) and a full page with month, agenda and day views and layer toggles.
- Module feeds: EXMCL datesheets and results, CNTR duties, CPITL fee dues (own child only), APPNT, ACTVT. Others behind the provider registry as modules are touched.
- Notifications: in-app at publish, change and cancel; day-before and morning-of reminders; acknowledge.
- Email through SES with an outbox, per-recipient log, List-Unsubscribe, school name in From and school Reply-To, and `.ics` PUBLISH/CANCEL.

**v1.1**
- Per-user secret ICS feed.
- Consent per child (+ CPITL fee) and RSVP.
- PTM day linked to APPNT slots.
- Observance library and state holiday templates.
- Digests and per-category preferences with a critical override and quiet hours.
- Web push.
- Clash warnings (rooms, staff duties).

**Later**
- WhatsApp utility templates and DLT SMS as escalation channels.
- Bilingual segment text.
- Printable year planner.
- Offline view.
- Saved ad-hoc groups.
- CPD hour tracker.
- Resource booking.

## 9. Fix independently of the calendar
- **Start the notification scheduler on EC2** (`server/src/server.js`: it starts only in the Vercel branch). Add a lease or running guard so two instances don't double-send, and stop it on SIGTERM.
- Move mail off the shared Hostinger mailbox before any bulk feature. Auth mail and broadcasts must not share a quota.
- Internal datesheets can't be published from the UI (`ExmclDatesheets.tsx` never calls `datesheetService.publish`).
- ASETS forms can't set maintenance next-due, warranty end, expected return or custodian, so existing asset reminders never fire.
