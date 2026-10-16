# Capabble – Project Brief for Video Generation

Use this document to explain the project to an AI that will generate a demo or promotional video.

---

## 1. One-Line Description

**Capabble** is a full-stack web application that helps schools and examination centres manage the entire exam lifecycle: from importing CBSE datesheets and candidate lists, to generating centre-specific datesheets, seating plans, and tracking answer-sheet inventory—all in one place.

---

## 2. Who It Is For & What Problem It Solves

- **Target users:** School admins, examination coordinators, data-entry operators at CBSE-affiliated or similar examination centres.
- **Problem:** Managing exams manually is error-prone: datesheets, room allocation, seating plans, Form 66 (attendance), and answer-sheet stock are often in separate spreadsheets or papers. Coordination is slow and mistakes are common.
- **Solution:** Capabble brings all of this into a single web app: one login, one dashboard, and workflows that connect datesheets → candidates → centre datesheet → seating plan → answer sheets and Form 66.

---

## 3. What the System Does (High Level)

1. **Imports official data** – CBSE datesheet PDFs, candidate lists (PDF/Excel), Form 66 PDFs, answer-sheet templates.
2. **Builds centre-specific views** – e.g. a datesheet that shows only the subjects and dates relevant to the candidates at that centre.
3. **Generates seating plans** – Allocates candidates to rooms and seats by date and subject, with PDF export.
4. **Tracks answer sheets** – Received, used, discarded, and balance by type (Main, Graph, etc.) and serial numbers.
5. **Manages master data** – Teachers, subjects, candidates, rooms, and users with role-based access (Admin vs Data Entry Operator).

---

## 4. Key Features (In Order You Might Show in a Video)

### 4.1 Login & Dashboard
- Login with email/password; roles: **Admin** and **Data Entry Operator**.
- Dashboard shows summary: teachers, candidates, subjects, datesheets, and quick actions (e.g. “Create datesheet”, “Allocate rooms”).

### 4.2 Subjects & Master Data
- **Subjects:** Name, code, class (10th/12th), duration, marks. Used across datesheets and centre datesheet.
- **Teachers:** Name, contact, subject assignments.
- **Candidates:** Roll number, name, class, subject choices. Can be added manually or **imported from PDF/Excel**. Subject choices drive the centre datesheet and seating plan.

### 4.3 Datesheets (CBSE-Oriented)
- **Import CBSE datesheet** from official PDF: system parses dates, subject codes, subject names, class, duration, answer-sheet type.
- Stored as “Full datesheet” and used as the source for centre datesheet and seating.

### 4.4 Centre Datesheet
- **Auto-generated** from the full CBSE datesheet: shows only the **subjects that candidates at this centre have chosen**.
- So each centre sees only its relevant exam dates (by date, day name, subject). Reduces confusion and printing irrelevant dates.

### 4.5 Seating Plan
- **Generate seating plan** by exam date and subject.
- Uses **Form 66** data (candidates present for that date/subject) and **room allocation** (capacity, floor).
- Output: which candidate sits in which room and seat number. Can export as **PDF** for printing and display.

### 4.6 Form 66 (Attendance / Nominal Roll)
- **Upload Form 66 PDF** (CBSE format): system parses centre number, centre name, exam date, subject, and roll numbers (including ranges).
- Stored per date and subject; used when generating seating plans so only “present” candidates get seats.

### 4.7 Answer Sheets
- **Types:** Main (32/20 pages), Graph, Supplementary, For Blind, Drawing Sheets, etc., with colours and serial ranges.
- **Tabs/views:** Received | Used | Balance | Discarded.
- **Actions:** Add received quantity (with serial range), mark as used, mark as discarded. Balance = total − used − discarded.
- Can **load from PDF template** (parse official template) or add entries manually.

### 4.8 Room Allocation
- Define rooms (number, capacity, floor). Allocate rooms to exam dates/subjects; used by seating plan generation.

### 4.9 UI/UX
- **Responsive** (desktop/tablet).
- **Dark/Light theme** toggle.
- **Tables:** sortable, filterable, paginated.
- **Toasts** for success/error; **modals** for forms and confirmations.

---

## 5. Tech Stack (For “How It’s Built” or Credits)

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Redux Toolkit, React Router, Axios, React Hot Toast.
- **Backend:** Node.js, Express, MongoDB (Mongoose).
- **Auth:** JWT with refresh; role-based access.
- **Files:** PDF parsing (e.g. pdf-parse), Multer for uploads; Excel support for some imports.
- **Deployment:** Can run on Vercel (frontend), Render/Node (backend), MongoDB Atlas (DB).

---

## 6. Suggested User Journey for the Video (Narrative Flow)

1. **Opening:** Show the problem – stacks of papers, multiple spreadsheets, “exam chaos”.
2. **Intro:** “Capabble brings it all into one system.” Show login and dashboard.
3. **Setup:** Briefly show Subjects and Teachers (or Candidates) as “master data”.
4. **Datesheet:** Import a CBSE datesheet PDF → show parsed dates and subjects.
5. **Centre view:** Open “Centre datesheet” → “Only exams for our candidates” → scroll through dates.
6. **Candidates:** Show candidate list and subject choices; mention PDF/Excel import.
7. **Form 66:** Upload Form 66 PDF → “Who’s actually appearing” for a date/subject.
8. **Seating:** Generate seating plan for one date/subject → show room-wise list or PDF.
9. **Answer sheets:** Show Received/Used/Balance; add a batch and “use” some.
10. **Closing:** Dashboard again – “One place for dates, candidates, seating, and answer sheets.”

---

## 7. Visual / Screen Suggestions for the AI

- **Show the dashboard** first (cards, counts, quick actions).
- **Show at least one “import”** – CBSE datesheet PDF or Form 66 PDF – and the result (table/list).
- **Show centre datesheet** as a clean table: Date | Day | Subject | Class | Duration.
- **Show seating plan** as table or PDF: Room | Seat | Roll No | Name.
- **Show answer sheets** with tabs (Received / Used / Balance) and serial ranges.
- **Show one modal/form** (e.g. Add candidate or Add answer-sheet entry) to convey “everything is editable in-app”.
- **Show theme toggle** (dark/light) to highlight modern UI.
- **Keep text on screen minimal:** prefer labels like “Centre datesheet”, “Seating plan”, “Answer sheets” rather than long paragraphs.

---

## 8. Tone & Key Messages for the Script

- **Professional but simple:** “Examination management, simplified.”
- **Emphasize:** one system, less paper, fewer errors, centre-specific dates, automated seating, and answer-sheet tracking.
- **Avoid:** deep technical jargon (e.g. “MERN”, “JWT”) unless the video is for developers; for school staff, focus on **what** they can do, not **how** it’s coded.
- **Call to action (if applicable):** “Try Capabble for your centre” or “See the repo / deploy your own instance.”

---

## 9. Short “Copy-Paste” Summary for the AI

You can paste this block to an AI video generator or script writer:

```
Capabble is a full-stack examination management web app for schools and exam centres. It lets staff:
- Import CBSE datesheet PDFs and candidate/Form 66 PDFs
- View a centre-specific datesheet (only subjects their candidates have chosen)
- Generate seating plans by date and subject (with PDF export)
- Track answer-sheet inventory (received, used, discarded, balance by type and serial number)
- Manage subjects, teachers, candidates, and rooms in one place

Users log in as Admin or Data Entry Operator. The UI is responsive, supports dark/light theme, and uses tables, modals, and toasts. Built with React (Vite, TypeScript), Tailwind, Redux, and Node/Express/MongoDB. The video should show: login → dashboard → import datesheet → centre datesheet → candidates → Form 66 upload → seating plan generation → answer-sheet tracking, and end with the message that everything is in one system to reduce paper and errors.
```

---

*End of project brief. Use sections 1–2 for a 30-second pitch, 4–6 for a 2–3 minute walkthrough, and 9 for a single prompt.*
