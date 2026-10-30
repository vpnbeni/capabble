# Board brief: Capabble

(Written from the product's own repository and public pricing page. No opinion of the idea is included. Figures not listed are unknown.)

## The idea
- What it is: a modular, cloud school ERP for Indian K-12 schools. A school can buy one module or all of them; modules share data when combined. Positioned like "AWS for school software": each module works standalone, one-click to add more.
- Who it is for: private CBSE-affiliated schools in India, roughly 300–2,000 students. Buyers: principal, owner/trustee, school office/accounts. First market visible in product copy: Haryana / North India.
- Price (public, ex-18% GST): 14 modules priced in three tiers: ₹12,000/yr (Students, HR/Staff, Academics, Internal exams, CBSE Exam-centre control, Capital & Finance), ₹7,200/yr (Attendance, Timetable, Transport, Assets, Library), ₹4,000/yr (Appointments, Activities, Medical clinic). Monthly: ₹1,100 / ₹640 / ₹400. Each covers up to 500 students. "Complete school" = all 14 for ₹60,000/yr or ₹5,500/month, plus ₹120/yr per student above 500. 14-day free trial (all modules open). Launch code LAUNCH50: first invoice half price (on yearly, the whole first year = ₹30,000). Logins for staff, parents and students are free. Group pricing for school trusts on request.
- Delivery: web app + Expo mobile app (families and staff, push notifications). Self-serve signup, Razorpay (UPI/card/netbanking, autopay), GST invoices. A calendar on every dashboard; family portal for parents and students.

## What exists today (from the code)
- Mature: CBSE examination-centre management (datesheet import from CBSE PDFs, seating plans, invigilator duties, Form 66 attendance, answer-sheet dispatch), timetable generation, calendar, appointments, assets, capital/finance (fees, receipts, payroll with PF/ESI/PT), billing, backups/data export.
- Partial: students, internal exams (admit cards, report cards, award lists), academics, activities, transport, staff/HR.
- Thin (only a small screen behind them today): library, medical clinic, attendance (the module wrapper is small; attendance pages exist).
- Team: effectively one developer-founder (239 of 240 commits in 2026). Sales, support and implementation capacity: unknown.
- Paying customers: unknown. Billing has a "grandfather" path for existing schools, so some schools already use it for free.

## Unknown (open questions)
Number of current schools and paying schools; customer acquisition cost; sales team; cash runway; market share of incumbents in the target region.
