# Next: the setup work on the phone too (brief of 28 Oct 2026)

The 27 Oct plan (`mobile-staff-plan.md`) brought every day-to-day staff page into the Capabble app. More → "On the
website" (`WEB_MODULES` in `mobile/src/staff/access.ts`) still holds eleven rows of setup and printing work, each
with its reason (table "Final state" at the end of `mobile-staff-plan.md`). The owner wants these in the app as
well, so the website is only needed for things a phone truly can't do.

## The eleven rows

| Row | Web pages (paths in `packages/shared/src/tenantFeatureCatalog.json`) | Likely phone shape |
|-----|------|------|
| Timetable setup | `/time-table/period-distribution`, `/time-table/bell-timings`, `/time-table/class-wise`, formats | Bell timings and periods per subject as forms; swap or move one period in a class's week; run the generator and show conflicts. The full drag grid stays web if it can't fit 360dp |
| Exam setup and printing | `/exmcl/exams`, marks distribution, admit cards, seating plan, report card, award list, question papers | Create and edit an exam and its datesheet; make admit cards, seating plans and award lists as PDFs to share (server already renders PDFs); choose a report card design (designing one stays web) |
| Board exam centre | `/centre-details`, datesheets, candidates, rooms, seating, duties, Form 66, UMC, stickers, dispatch | Centre details, rooms, duties and answer-sheet counts as forms and lists; printed forms as shared PDFs. Imports of board PDFs need a file picker |
| Students and classes setup | `/stdnt/classes`, `/stdnt/subjects`, student import | Classes, sections and subjects as lists with add and edit; spreadsheet import needs a file picker |
| Finance setup | `/cpitl/dashboard` and its structures, budgets, payroll runs, electricity, projects | Fee structures (one class at a time), budgets by head, running and finalizing a month's payroll, an electricity bill against a meter, a building project's payments |
| Activities setup | `/actvt/houses` and clubs, councils, sports, tours, functions | Add and edit houses, clubs, councils, sports events, tours and functions; certificate design stays web |
| Library purchasing | `/libry/overview` acquisitions, receiving, stocktake, reports, digital | Add a book and its copies, purchase requests and approvals, receive an order, a stocktake by typing accession numbers (scan later), reports as PDFs |
| Asset register setup | `/asets/dashboard` add, procurement, audits, categories, vendors, reports | Add an asset, categories, vendors and places, purchases and receiving, an audit by typing asset IDs (scan later), reports as PDFs |
| Transport setup | `/trnst` routes, stops, buses | Add and edit buses, routes and their stops in order (times), give a route its bus |
| School setup | `/account-settings`: roles, school email, online payments, logo and colours | Roles with a permission list per module (not the grid), school email and payment keys (masked, write-only), logo once the photo picker exists |
| Billing | `/billing` | The plan, invoices as PDFs, change plan if the billing module allows it from a phone |

## Rules (same as before)

- Read `mobile/AGENTS.md`, `mobile/src/ui/DESIGN.md` and `client/src/components/ui/DESIGN.md` first. Build only from
  `@/ui`; add missing pieces to the kit.
- Every screen fits 360 × 640dp at 1.3× text (web preview `?text=1.3&os=android`). A big grid becomes one class,
  one subject or one day at a time; one task per screen or sheet. The keyboard never covers the field.
- Reuse the web's endpoints and the server's permission checks. Gate with `useStaff()`. A save changes only what
  the phone changed (several server updates replace whole records: check each PUT before writing it).
- New native modules (document picker, image picker, camera, location, maps) need a new EAS build and a version
  bump: ask first. Plan file imports, logo upload and scanning as a later slice behind that build.
- Order the slices by how often each is used; write the plan into this file and wait for approval before coding.
- After each slice: `npx tsc --noEmit` and `npx eslint src` in `mobile/`, check on stage as the role that uses it,
  commit as `97426806+vpnbeni@users.noreply.github.com` on `stage` (no Co-Authored-By), publish to `preview`
  (`EXPO_PUBLIC_API_URL=https://stageapi.capabble.cloud/api npx eas-cli@latest update --channel preview
  --environment preview --platform android --message "…" --non-interactive`) and say plainly that it is live,
  add a row to the done table here, and remove what the slice covers from `WEB_MODULES`. Never push; the user
  pushes and runs `deploy-stage`. Stage test logins are in the agent's memory, never in the repo.
- Done means "On the website" is empty, or holds only what can't work on a phone, with the reason written here.

# Plan (28 Oct 2026, waiting for approval)

Checked against the code: web pages in `client/src/App.tsx` and `client/src/services/*`, server routes and their
permissions (gate rules in `permissionCatalog.json`, `requirePermission` / `requireCpitlPermission` on the route).
PDFs reuse `src/lib/sharePdf.ts` (takes the bytes, so POST endpoints work too); CSV and Excel go the same way through
`expo-file-system` + `expo-sharing`, both installed. Only the last slice needs a new build.

## What the code says (shapes the slices)

- **Classes, sections, subjects and the whole timetable are one document.** `PUT /timetable/state` rebuilds the
  session's `TimetableState` from the payload (classes, subjects, teachers, allocations, `periodAllocation`,
  `timetableGrid`); there is no version check, and the web's `TimetableContext` autosaves its full snapshot on a timer.
  A phone save would be undone by any open web tab (and the other way round). Slices 7 and 8 need a small server
  change (question 2). `/stdnt/classes` and `/stdnt/subjects` don't use `/subjects` or any classes API.
- **Whole-record PUTs** (the phone reads the record fresh and sends it back whole with only its change):
  `/trnst/vehicles/:id` (missing fields reset to defaults), `/trnst/routes/:id` (stops array whole; keep each stop's
  `_id`, assignments point at it; the route's bus is `vehicleId` here), `/roles/:id`, `/centre-details`,
  `/timetable/bell-timings`, `/mail-settings`, `/cpitl/payment-settings` (secrets blank = keep), fee structure
  `components` / `applicableClasses`, project `milestones` / `documents`, datesheet `subjects[]`, house and club
  `members` / `activities` / `teachers` (and a house or club PUT without `isActive:false` makes it active again).
- **Partial updates** (send only the change): exam definitions, library titles and copies, assets, categories,
  vendors, places, electricity meters and bills, budgets (upsert per head), payslip edits, school profile.
- **Not built on the web either** (placeholders, no API): marks distribution, question papers, UMC. Nothing to bring;
  they leave the row text. Report cards have one saved design, so there is no "choose a design" step.
- **No web screen yet** for library purchase orders and receiving (`POST /libry/purchase-orders`,
  `/:id/receive`) or adding many copies at once (`/libry/copies/bulk`): the phone gets them first.
- Uploads (need the picker build): `/students/import-template/upload`, `/datesheets/import-pdf`,
  `/candidates/import` and re-import, `/form66/upload` (`.txt`), `/answersheets/upload/excel`,
  `/school-profile/logo`, house and club logos (multipart, the other fields work without a file), admit card and
  report card design images, `/cpitl/attachments` (bill photos, project documents).

## Slices, most used first

| # | Slice | Who, how often | Phone shape | Web endpoints reused |
|---|---|---|---|---|
| 1 | Exam setup and printing | Exam coordinator and class teachers, every exam | Exams: add or edit an exam (name, term, dates, max marks; partial), its subjects; a class's datesheet (subject, date, time; `subjects[]` sent whole), publish it. Print: admit cards, award list, report cards for a class, seating plan slips, each a PDF to share | `/exam-definitions` (+ `/subject-matrix` for one exam's subjects), `/datesheets`, `/:id/publish`; `POST /admit-cards`, `/award-list`, `GET /report-card/bulk`, `/seating-plan/generate/*/:datesheetId` |
| 2 | Library purchasing | Librarian, weekly | Add a book (ISBN look-up fills it) and its copies (accession numbers, several at once); purchase requests and approve or reject (not your own); suppliers; a purchase order and receiving it (copies made as they arrive); stocktake by typing accession numbers; reports (inventory, overdue, fines) as lists; digital library links | `/libry/titles`, `/titles/lookup`, `/copies`, `/copies/bulk`, `/acquisitions`, `/:id/review`, `/suppliers`, `/purchase-orders`, `/:id/receive`, `/stocktakes`, `/:id/scan`, `/:id/close`, `/reports/*`, `/digital-resources` |
| 3 | Asset register setup | Assets in-charge, weekly | Add an asset; categories, vendors and places (place tree one level at a time); a purchase and receiving it (assets or stock made on receipt); an audit by place or category, typing asset IDs, marking found, missing, damaged; reports as lists with "Share as CSV" | `/asets/assets`, `/categories`, `/vendors`, `/locations` (`/tree`), `/procurement`, `/:id/receive`, `/audits`, `/:id/scan`, `/:id/items/:itemId`, `/:id/close`, `/reports/:type` |
| 4 | Month-end finance | Accounts, monthly | Payroll: start a month, each person's loss-of-pay days, arrears and deductions (draft), finalize, mark paid (date, mode, reference), reopen; share the bank sheet. Electricity: meters, add a month's bill, pay. Building projects: details, add a payment | `/cpitl/payroll/runs`, `PUT /:month`, `/finalize`, `/pay`, `/reopen`, `/bank-sheet.xlsx`; `/cpitl/electricity/connections`, `/bills`, `/:id/pay`; `/cpitl/infra/projects`, `/:id/payments` |
| 5 | Activities setup | Activities in-charge, several times a term | Sports events and results, tours (students going), functions, councils with posts; houses and clubs (name, colour, teachers, members). Logos wait for the picker | `/actvt/sports`, `/tours`, `/functions`, `/councils`, `/council-posts`, `/houses`, `/clubs` |
| 6 | Transport setup | Transport in-charge, a few times a term | Buses (number, registration, seats, driver and conductor, papers); routes with stops in order, pickup and drop times; give a route its bus | `/trnst/vehicles`, `/trnst/routes`, `/trnst/places` |
| 7 | Timetable | Timetable in-charge, each term and on changes | Bell timings by day; periods per subject for one class; generate and see what didn't fit (class, subject, expected, got); versions (publish, archive); move or swap one period in a class's week; class and teacher PDFs to share | `/timetable/bell-timings`, `/timetable/generate`, `/versions`, `/:id/publish`, `/:id/archive`, `/:id/export/class-pdf`, `/teacher-pdf`; server: question 2 |
| 8 | Classes, sections and subjects | Office, once a year and on changes | Classes with their sections (add, rename, remove), subjects (add, edit) | server: question 2 (today only the whole `PUT /timetable/state`) |
| 9 | Fee structures and budgets | Accounts, once a year | Fee heads; a fee structure one at a time (components and installments, classes it applies to), assign it, duplicate, archive; budgets by head, "copy from last year's actuals" | `/cpitl/fee-heads`, `/fee-structures` (+ `/assign`, `/duplicate`, `/archive`, `/restore`, `/reapply`), `/cpitl/budgets`, `/copy-from-actuals` |
| 10 | Board exam centre | Centre superintendent, once a year (Feb–Apr) | Centre details; rooms (add, capacity, sync from assets); duties for a date (room by room); answer sheets (series, used, discarded, daily summary); Form 66 by date; PDFs: seating slips, stickers, duty record, dispatch slip, Form 66, answer-sheet records. Imports wait for the picker | `/centre-details`, `/seating-plan/rooms`, `/sync-from-asets`, `/duties`, `/duties/assign`, `/answersheets/*`, `/form66/dates/*`, the `*/pdf` and `/download` routes above |
| 11 | School setup | Administrator, rarely | Roles: name and a permission list grouped by module (one module at a time, not the grid; saving signs the role's holders out, the confirm says so); school email (host, port, user, password write-only, "Send a test to me"); online payments (key ID, secrets write-only, "Check the keys"); brand colour | `/roles`, `/roles/catalog`, `/mail-settings`, `/test`, `/cpitl/payment-settings`, `/test`, `PUT /school-profile` |
| 12 | Billing | Administrator, a few times a year | The plan, next charge, invoices, receipts and credit notes as PDFs | `GET /billing/me`, `/invoices`, `/payments`, `/credit-notes`, `/*/:id/pdf` |
| 13 | **New build**: files, photos, scanning | — | `expo-document-picker`: student spreadsheet import (result: created, updated, skipped, errors), CBSE datesheet and candidate PDFs, Form 66 `.txt`, answer sheets Excel. `expo-image-picker`: school, house and club logos, bill photos and project documents, student documents. `expo-camera`: scan in stocktakes, audits and the library desk | the upload routes listed above |

Each slice: `useStaff()` gate on the same permission the server checks (exam: `exam.setup.write`, printing
`exam.results.read`; library and assets: their `requirePermission` action per button; finance: `cpitl.finance.<action>`;
school setup: `core.users.manage`, `core.school.write`, `cpitl.finance.settings`; billing: `core.billing.read`), and
its `WEB_MODULES` row removed or cut down to what is left.

## What stays on the website, and why

| Stays | Why |
|---|---|
| Admit card, report card and award list designs | Laying out a printed page (logos, signatures, positions) needs a big screen and a print preview. Printing them is in the app (slice 1) |
| The timetable's whole-school grid (teacher × subject × class allocation, editing every class's week at once) | A school-wide matrix; the phone does one class at a time, generating, and moving a period (slice 7) |
| Paying for or changing the Capabble plan | Paying goes through a Razorpay page outside the app; buying a subscription that way inside an app falls under App Store and Play Store purchase rules. The app shows the plan and invoices (slice 12) and opens the website to pay |
| Printing certificates | Printed by the browser from a fixed layout (no server PDF). Recording them is in the app |
| Until slice 13: imports, logos, scanning | Need the picker and camera build |

After slice 12, "On the website" holds those rows only; after slice 13 the "until" row goes too.

## Questions for approval

1. The order (exams, library, assets, month-end finance, activities, transport, timetable, classes, fee structures,
   board centre, school setup, billing, then the build).
2. Timetable and classes (slices 7, 8): add to the server (a) a version check on `PUT /timetable/state` (409 when
   the saved state changed since it was read; the web reloads and says so) and (b) small endpoints that change one
   thing atomically: a class and its sections, a subject, one class's periods per subject, move or swap one period.
   Without (a), the web's autosave can quietly undo a phone change. Needs a push and `deploy-stage` before checking.
3. Checking "as the role that uses it": stage logins in memory are the administrator and a teacher. May I create
   test logins on stage for an exam coordinator, librarian, accountant and transport in-charge (Settings → Users),
   or check those slices as the administrator?
4. The build for slice 13 (three native modules, one version bump), when we get there.

## Done (plan approved 28 Oct 2026)

Each checked in the web preview (360 × 640, `?text=1.3&os=android`) against stage, as the role that uses it, then
published to `preview`.

| Slice | What | Code | Checked on stage |
|---|---|---|---|
| 1 | Exam setup and printing: "Add an exam" (name, short code, how long, out of; duplicate names and codes refused), an exam's More → Edit exam (only changed fields), Choose subjects (one exam's subjects; none = every subject), Remove exam (marks stay saved); Datesheets on the exam (draft or published, dates and papers) → a class's datesheet: class (and section for 11 and 12, one datesheet per class or section), papers as subject, day, start and end (quarter hours; duration worked out), saved whole, opens as itself after the first save, Publish with a confirm (final after that), Delete draft; Print (from the exam's bar): admit cards (exam setup), award list for a subject from the class's datesheet or blank, report cards for a class, each a PDF to the share sheet; "own classes only" logins see their classes. Found and handled: stage keeps its subjects only in the timetable while a datesheet must point at the school's subject list (the website's builder fails there), so the phone lists the timetable's subjects too and adds a chosen one to that class's subject list when the datesheet is saved (needs `core.subjects.write`, else it shows "Not on the school's subject list yet"). The datesheet list sends subject ids only, so a datesheet is read on its own (`GET /datesheets/:id`). Seating plan PDFs moved to slice 10: they print from the board-centre rooms and datesheets. "Exam setup and printing" on the website became "Exam print designs" (admit card, report card and award list layouts) | `exams/index.tsx`, `exams/[id].tsx`, `exams/subjects.tsx`, `exams/datesheet.tsx`, `exams/print.tsx`, `staff/ExamSheet.tsx`, `staff/examSetupQueries.ts`, `services/examService.ts`, `staff/access.ts` | Admin: added "App check unit test" (ACUT, out of 25; "T1" refused as taken), chose English and Mathematics, made Class 7's datesheet (English 29 Oct, Mathematics 30 Oct; both added to Class 7's subject list), moved English to 10 am to 12 pm and saved (whole list sent), published (read only after), admit cards, the English award list and report cards for 7-A came back as PDFs (88, 33, 116 KB), edited "out of" to 30, removed the exam. Teacher with own classes only (Mrs. Meenu Hooda): no Add, no exam menu or publish bar, only Class 3-B; Print offers award list and report cards (no admit cards), 3-B report cards came back, 7-A refused by the server (403). Cleaned up after: datesheet, exam and the two subjects deleted |
| 2 | Library purchasing: Library → More (Add a book, Buying books, Stocktake, Reports, Digital library, each for the logins with that library permission). Add a book: ISBN look-up (a book the library has takes the copies), title, authors, publisher, year, class number, then its copies as a run of accession numbers (first one and how many: LIB-0098, LIB-0099…; a used number says so) and price; a catalogue title → Add copies. Buying books: requests (copies, rough price, what for; approve or reject with a reason, never your own: the server records the asker by name or by email, the app matches both), approved → Order it; orders (supplier, books with how many and price) → receiving: per book how many came and their accession numbers, matched to the catalogue by ISBN, then exact title, else added; suppliers (call from the list). Stocktake: start, type each accession number found (a wrong or repeated one says so; scanning waits for the camera build), close: copies not found go on its missing list, shown after. Reports: copies by status and value, overdue, fines. Digital library: open links, add one (https only, kind, who can see it). Purchase orders and receiving had no website screen. Server (needs a push and `deploy-stage`): received copies that name their order line count against it (before, copies filled the lines in order, so receiving the second book first counted it as the first); copies without a line behave as before; tests in `modules/libry/__tests__/receive.test.js`. "Library purchasing" left "On the website" | `library/add-book.tsx`, `library/purchases.tsx`, `library/order.tsx`, `library/receive.tsx`, `library/stocktake.tsx`, `library/reports.tsx`, `library/digital.tsx`, `library/index.tsx`, `services/libraryService.ts`, `staff/libraryQueries.ts`, `staff/access.ts`; server `controllers/libryController.js` | Admin (no librarian or principal login on stage): added "App check atlas" with APPCHK-0001 and -0002, APPCHK-0002 again refused with the message; requested "App check dictionary" (2 at about ₹250): no Approve on own request, the server refuses it too (403); added supplier "App check books", ordered 3 atlases at ₹300 and 1 "App check globe", received 2 atlases (onto the existing title), then the last atlas and the globe (added to the catalogue): order Received; stocktake of 7 copies, counted one, a wrong number refused, closed with 6 not found; reports showed 7 copies worth ₹900; digital link sheet refused an http link (not saved: links can't be removed). Not checked: approving or rejecting someone else's request (needs a second login with `libry.acquisitions.request`); line-by-line receiving waits for the deploy (this test received in line order, the same either way). Cleaned up: test copies withdrawn and both titles hidden; the request, supplier, order and stocktake stay (no delete on the server) |
| 3 | Asset register setup: Assets → More (Add an asset, Purchases, Audit, Reports, Set up; each for the matching `asets.assets.*` permission). Add an asset: what it is, category (sets its asset ID), place, vendor, in the store or in use, how many alike (several get an ID each), make, model, serial (one only), cost. Set up: categories (name and code, the code starts asset IDs; rename or recode), vendors (contact, phone, email, GSTIN; only changed fields), places (a campus, then a block, floor or room inside it, the kind of room; rename). Purchases: record one (assets tracked one by one, or counted stock; how many, price, warranty, category, vendor, where it goes), mark received (makes the assets, or the stock item). Audit: everything, a place or a category; type each asset ID found (scanning waits for the camera build); mark the rest found, in the wrong place, damaged or missing (missing marks the asset lost, damaged marks it damaged); close. Reports: count and value by category and by place, the whole register shared as a CSV. Removing categories, vendors and places stays on the website. "Asset register setup" left "On the website" | `asset-register/add.tsx`, `setup.tsx`, `purchases.tsx`, `purchase.tsx`, `audit.tsx`, `reports.tsx`, `index.tsx`, `services/assetService.ts`, `staff/assetQueries.ts`, `lib/sharePdf.ts` (+ `.web.ts`, `shareText`), `staff/access.ts` | Admin: added "App check floor" inside "App check block" (title follows the level: Add a floor), two "App check chair" (ASETS-APPCHK-000002 and -000003), a purchase of "App check desk" refused without a category then saved and received (ASETS-APPCHK-000004), an audit of the App check category: typed -000002 found, marked -000003 missing, closed; reports showed 4 assets worth ₹43,500 and the register CSV came back. Cleaned up: the three assets archived, the floor deleted; the purchase and audit stay (no delete) |

Found, not fixed (server, needs a deploy): admit cards take the class's latest internal datesheet without checking
which exam it belongs to (`admitCardController.js`, the `DateSheet.findOne({ class, examType: 'internal' })`), so a
class with datesheets for two exams can print the wrong papers on an admit card.
