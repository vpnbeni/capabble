# Capabble (school ERP) · Business plan

**Verdict: Not yet**

- ✓ Each school-month earns $2906.00 before fixed costs (73% contribution).
- ✗ Year 1 operating LOSS: $1,307,586.
- ✗ 0 of 20 simulated buyers buy (0%, the bar is 25%).

| key number | |
| --- | ---: |
| Price | $4000.00 a school-month |
| Profit margin at plan | -29% per school-month |
| Break-even | 56 school-months a day |
| Year 1 operating profit | $-1,307,586 |
| Startup spend | $70,000 |
| Cash needed before it pays for itself | $1,377,586 |
| Startup money earned back | not in year 1 |
| Buyer panel | 0 buy · 20 pass |

## The idea

- What it is: a modular, cloud school ERP for Indian K-12 schools: buy one module (e.g. timetable, CBSE exam-centre control, fees) or the whole system, and modules share data when combined.
- Who it is for: private CBSE-affiliated schools in India, roughly 300 to 2,000 students, where the principal, owner/trustee or the school office buys software (first market seen in the product: Haryana / North India).
- What it sells, at what price (from capabble.cloud/pricing, ex-18% GST): 14 modules at ₹4,000 / ₹7,200 / ₹12,000 a year each (₹400 / ₹640 / ₹1,100 a month), each covering up to 500 students; "Complete school" = all 14 for ₹60,000 a year (₹5,500 a month), +₹120 a year per student above 500. 14-day free trial. Launch code LAUNCH50 halves the first invoice (first year on yearly billing). Staff, parent and student logins free. Group price for trusts on request.
- Where and how: online SaaS (web app + Android/iOS app for families and staff). Self-serve signup with OTP, trial, Razorpay autopay; demo requests from capabble.cloud. Marketing site capabble.cloud, product at school.capabble.cloud.
- Budget and constraints: built by essentially one developer-founder (239 of 240 commits by one author in 2026). Hosting: EC2 (API), MongoDB (one DB per school), Neon Postgres (billing), Vercel (web). Marketing budget, team size and cash runway: NOT GIVEN.

## Summary

**What it is:** a modular cloud school ERP (14 modules, web + mobile app) for private CBSE schools in North India, sold self-serve at Rs 60,000/yr for the whole school (500 students) or Rs 4,000–12,000 per module.

**Verdict (computed by compile.py): NOT YET.**
- Each paying school-month earns Rs 2,906 after its own costs (73% contribution). ✓
- Year 1 operating loss ~Rs 13.1 lakh on estimated costs (break-even needs 56 paying schools at the half-price launch offer, 24 at full price). ✗
- 0 of 20 simulated buyers buy (bar 25%). ✗

**What the board and the panel agreed on:** the product isn't the problem; **trust and onboarding are**. 16 of 20 simulated buyers passed for "habit" (already on an ERP / Tally) or "trust" (never heard of you, nobody I know uses it); nobody passed on price. Every "what would flip a no" asked for the same two things: **someone comes to the school to import data and train staff**, and **a nearby school I know already uses it**. The board (3x FUND IF, avg 4.7/10) independently said: lead with the CBSE exam-centre wedge, hide thin modules, design done-for-you onboarding.

**Where they disagreed:** the Offers lens would *raise* price on the wedge; the panel wanted a sub-Rs 25,000 entry (the trust chairman's signing limit). Both can be true: a cheap single-season Exam Centre entry, full price for the whole school with setup included.

**Biggest risk:** distribution. A one-person team selling a self-serve ERP into a market that buys on referrals and on-site demos, against budget vendors at Rs 5k–25k (with free setup) and incumbents with sales teams. Schoolites already sells an exam-centre module.

**What's needed to start:** on estimates, ~Rs 14 lakh cash to reach break-even in year 1 at the current price; far less if LAUNCH50 is dropped and onboarding is charged for. Real figures (paying schools, founder draw, infra bills) are missing and must replace the estimates.

**The one thing to do this week:** call 20 CBSE exam-centre schools within driving distance and offer "Exam Centre, Done For You" for the 2027 board season. Goal: 10 paid by 15 Jan 2027 and 3 reference schools.

*Simulated buyers and projected numbers, not customers or accounts. Confirm with real schools and an accountant. Not financial, legal or tax advice.*

## What the board said

**Vote: 3 FUND IF, 0 FUND, 0 PASS. Average score 4.7 / 10** (Offers 5, Monopoly 4, Product 5).

### Risks more than one member raised (most dangerous first)
1. **No proof of demand.** Paying schools, renewals, trial conversion and CAC are all unknown; existing schools are on free "grandfathered" access. (All three.)
2. **Too wide, too thin.** 14 modules on the price page, ~6 mature, 3 near-empty (Library, Medical, the Attendance wrapper). "Complete school" invites judging the product by its weakest page. (All three.)
3. **Onboarding / data migration / support has no owner.** One developer-founder; who imports a school's data and answers the phone in exam week is undefined. (Offers, Product.)
4. **Sold as a me-too ERP on price.** "14 modules, half off" puts it in a feature-and-price comparison with incumbents; LAUNCH50 trains discount expectations. (Offers, Monopoly.)
5. **No distribution channel** for the first 100 schools. (Monopoly; Offers via "who has the pain and money".)

### Conditions (checklist for the rest of the pack)
- [ ] Lead with ONE wedge: CBSE exam-centre control (all three agree), optionally finance/fees as second door.
- [ ] Hide or mark "coming soon" every thin/partial module; stop calling it "Complete school" until they're real.
- [ ] Done-for-you onboarding (data import, staff training, exam-week support) in the offer, with a named guarantee.
- [ ] Replace the 50% launch discount with added value (onboarding, guarantee) — *Offers*. (Tested by `/founder-pricing`, `/founder-offer`.)
- [ ] Real numbers: paying schools, renewals, trial→paid, weekly active use per module. (`/founder-cfo`, `/founder-launch`.)
- [ ] Size the small market: CBSE exam centres in Haryana / North India, and Capabble's share. (`/founder-competitors`.)
- [ ] A repeatable channel for the first 100 schools with a measured cost per school.
- [ ] A named support/implementation plan beyond the founder.
- [ ] Freeze new modules until the existing ones meet the bar.

### Where they disagree
- Monopoly is most pessimistic (4): even the exam-centre wedge is copyable by an incumbent in months; durability only comes from lock-in plus owning a measurable share of centres.
- Offers thinks price could go *up* for the wedge ("could you charge double for the exam-centre outcome alone?"), while the current plan goes down (LAUNCH50).
- Product credits craft (backups, RBAC, GST, archives) that the other two don't weigh at all.

### The strongest version the board can see
Not the "AWS of school software" that was pitched. The board sees a **CBSE exam-centre operations product** sold to the few thousand schools that act as board-exam centres, priced on the outcome (a clean, error-free exam season) with onboarding done for them, sold through centre and trust networks in North India, then expanding into timetable, fees and the rest once the school is in. The 14-module ERP is the expansion path, not the front door.

## The competition

Public sources only. "Play" = Google Play star rating and rating count, read from the store page that day. Full rows and links: `competitors.csv`.

### 1. Competitors, most direct first

| # | Name | Type | Price of comparable item (whole school, ~500 students, per year) | Rating |
|---|---|---|---|---|
| 1 | [Schoolites](https://schoolites.com/school-problems/board-exam-compliance) | Exam-centre module inside an ERP | Not public ("1 month free after a small one-time registration fee") | none found |
| 2 | [Entab CampusCare](https://www.capterra.com/p/175717/CampusCare/) | CBSE-heavy full ERP, Delhi | Not public (quote only) | [Play 4.0, 276](https://play.google.com/store/apps/details?id=com.campuscare.entab.ui) |
| 3 | [Edunext](https://www.techjockey.com/detail/edunext-school-erp) | Full ERP, Noida | Not public ("Available on Request") | [Play 4.4, 19.3K](https://play.google.com/store/apps/details?id=com.edunext.tsmv10) |
| 4 | [MyClassboard](https://www.myclassboard.com/) | Full ERP + CRM + HR | Not public; [YourStory reported](https://ts.yourstory.com/smbstory/myclassboard-erp-school-software-pandemic-byju-whitehatjr) Rs 300–500 per student | [Play 3.8, 60.7K](https://play.google.com/store/apps/details?id=com.mcb.myclassboard.activity) |
| 5 | [Teachmint](https://www.teachmint.com/) | ERP, now led by classroom panels | Not public ([plans page](https://www.teachmint.com/plans) is a demo form) | [Software Advice 4.8, 74](https://www.softwareadvice.com/student-engagement/teachmint-profile) |
| 6 | [Fedena](https://fedena.com/pricing-and-plans) | Full ERP, self-serve | USD 999 / 1,399 / 1,699 a year | [Play 3.8, 339](https://play.google.com/store/apps/details?id=com.fedena.app) |
| 7 | [Pathshala ERP](https://pathshalaerp.in/school-management-software-pricing) | Budget, all modules | Rs 15,000 flat, unlimited students | none found |
| 8 | [EduGradUp](https://edugradup.com/pricing) | Budget, all modules | Rs 17,000 ex-GST (350–700 students) | none found |
| 9 | [School ERP India](https://schoolerpindia.com/pricing.php) | Budget | Rs 5,000 / 7,500 / 12,500 ex-GST (0–500) | none found |
| 10 | [VidyalayaERP](https://www.capterra.com/p/10016852/VidyalayaERP/) | Budget | Rs 7,500 "Basic" (per Capterra) | none found |
| 11 | [eSchoolApp](https://nu.eschoolapp.in/blogs/school-erp-pricing-india/) | Budget, per student | Rs 50 per student = Rs 25,000 | none found |
| 12 | [SkoolBeep](https://www.softwaresuggest.com/skoolbeep) | Communication app | Not public | none found |
| — | [Eklavvya seating generator](https://www.eklavvya.com/free-exam-seating-arrangement-generator/) | Free, generic exam seating | Free, up to 200 candidates | — |
| — | [Manual CBSE templates](https://docs.google.com/document/d/14Sii0Y5ad9ynvOX_GoDWoSW_DLGzECjz/export?format=pdf) | Word/PDF seating + invigilator tables | Free | — |
| — | [TallyPrime](https://tallysolutions.com/tally-prime-faq-guide/) | Fees and accounts | Rs 22,500 Silver one-time + GST | — |
| — | [Google Workspace for Education Fundamentals](https://edu.google.com/workspace-for-education/editions/education-fundamentals/) | DIY records + communication | "available without cost for qualified educational institutions" | — |
| — | Excel + WhatsApp | Status quo | Free | no source collected |

Their own headlines: Fedena "Affordable Plans for Smart Institutes"; Teachmint "AI‑Powered Connected Classroom Device"; Schoolites "Board Exam Compliance and Exam Center Management"; MyClassboard "Welcome to MyClassBoard". I could not read Entab's or Edunext's sites (DNS failure and HTTP 403).

Capabble for comparison: Complete school Rs 60,000 ex-GST, single modules Rs 4,000–12,000.

### 2. Price range

- **6 of the 12 direct competitors publish no price**, and they are the 6 best-known names (Entab, Edunext, MyClassboard, Teachmint, SkoolBeep, Schoolites). Hidden pricing is the norm at the top of the market.
- **Published INR prices come only from budget vendors.** For a full-school plan for about 500 students: low **Rs 5,000** (School ERP India A1), median **Rs 15,000** (Pathshala), high **Rs 25,000** (eSchoolApp at Rs 50 per student). That is 6 data points: 7,500, 12,500, 15,000, 17,000, 25,000, with 5,000 as the lowest tier. Most include every module, apps and free setup.
- Fedena: USD 999–1,699 a year.
- Third-party reports put MyClassboard at Rs 1.5–2.5 lakh for 500 students. [A comparison blog](https://www.fuzen.io/posts/school-management-software-comparison-fuzen-vs-entab-fedena-teachmint) puts Entab's one-time implementation fee at Rs 75,000–2,50,000 (anecdotal, unverified).
- **What this means for Capabble:** at Rs 60,000, Capabble costs **4x the published median**. It sits above every budget vendor that publishes a price and probably below the quote-only incumbents.

### 3. Positioning map: price vs implementation support

These are the two things a principal weighs: what it costs, and whether someone will set it up and answer the phone.

```
            HIGH PRICE / quote-only
                    |
   MyClassboard     |   Entab CampusCare
   Teachmint        |   Edunext
   (sales + panels) |   (field sales, onboarding)
                    |
 LOW SUPPORT -------+------- HIGH SUPPORT
                    |
   Capabble (Rs 60k,| Fedena (USD 999+, one-to-one
   self-serve, solo | training, onboarding)
   founder)         |
                    | Pathshala / EduGradUp / School ERP India
   Eklavvya, Excel, | (Rs 5–25k, "free setup, migration,
   Google Workspace | training")
            LOW PRICE / published
```

The cheap end already bundles setup and migration for free. Capabble sits in a weak spot: dearer than the budget tier, with less hand-holding than the incumbents.

### 4. Complaints, ranked

Sample: the reviews shown on each Play page (about 3 per app, 5 apps, 15 reviews in all). G2, Capterra and Capterra.in all returned 403, and I found no Reddit threads. All themes below are directional, not statistically solid.

1. **Notifications don't arrive** (4 reviews: MCB ×2, Ryan Parent Portal ×1, Edunext ×1). [MCB](https://play.google.com/store/apps/details?id=com.mcb.myclassboard.activity): "notifications have completely disappeared". [Edunext](https://play.google.com/store/apps/details?id=com.edunext.tsmv10): "the app does not send notifications when there is a new mail or notice". The Ryan Parent Portal app (`com.ibee.myclassboard.activity`) appears to be built on MyClassboard; that is inferred from the package name.
2. **Slow, laggy, crashing or broken after an update** (5 reviews: MCB ×2, Edunext ×1, Entab ×1, Fedena ×1). [Fedena](https://play.google.com/store/apps/details?id=com.fedena.app): "since July 2026 it's not working". [MCB](https://play.google.com/store/apps/details?id=com.mcb.myclassboard.activity): "takes ages to load".
3. **Login, password or forced-update failures** (3 reviews: Ryan Parent Portal ×1, Entab ×2). [Entab](https://play.google.com/store/apps/details?id=com.campuscare.entab.ui): "Always Giving URL code saying that the password is incorrect".
4. **Fees paid but not reflected, and no support channel** (1 review, Fedena; *thin*). [Fedena](https://play.google.com/store/apps/details?id=com.fedena.app): "no call center numbers or email addresses".
5. **Support needs a ticket even for small issues; modules are confusing** (Teachmint, from [review summaries](https://www.capterra.com/p/163105/Teachmint/reviews/?page=2); *thin*, and I could not read the reviews verbatim).

Most complaints come from parents using the apps. Principals and office staff, who are the buyers, are barely visible in public reviews.

### 5. The gap Capabble could own

**CBSE examination-centre operations.** Evidence:

- No ERP page I could read describes CBSE datesheet import, Form CBSE 66, or the CBSE seating rules. Fedena: [nothing on exam-centre management](https://fedena.com/). [MasterSoft](https://www.iitms.co.in/school-erp/examination/) does generic invigilation and hall tickets.
- The closest product is Schoolites. It covers duty rosters and answer-sheet dispatch, but its page doesn't mention seating plans, Form 66 or datesheet import, and its price is hidden.
- The free substitutes are generic or manual. [Eklavvya](https://www.eklavvya.com/free-exam-seating-arrangement-generator/) caps at 200 candidates, and the [CBSE templates](https://docs.google.com/document/d/14Sii0Y5ad9ynvOX_GoDWoSW_DLGzECjz/export?format=pdf) are filled in by hand.
- The work is heavy and rule-bound. The [CBSE Centre Superintendent guidelines](https://nis.edu.in/wp-content/uploads/2024/02/Centre-Superintendant-Guidelines-for-2024-Board-Exams.pdf) require Form 66 seating plans in triplicate, one copy sent with each day's answer-book packets, and seating in multiples of 24.

**Caveats, plainly:**
- The gap is narrow. It applies only to schools appointed as CBSE centres, and only in the February–April exam window.
- Not finding a feature on a vendor's site does not prove they lack it. Entab's site in particular was unreadable.
- On general ERP features there is **no gap**. Budget vendors already sell every module for Rs 5–25k a year with published prices and free setup. "Modular" and "transparent pricing" are not differentiators.

The defensible pitch: a Rs 4,000–12,000 exam-centre module sold on its own to any CBSE centre school, whatever ERP the school already runs. Then upsell from there.

### 6. The threat

- **Fastest copier: Schoolites.** It already markets "Exam Center Management" with duty rosters and answer-sheet dispatch. Adding seating plans and Form 66 is a short extension, and it would arrive with a demo-led sales team that Capabble lacks.
- **Biggest distribution threat: Entab.** It is CBSE-focused and [claims 2,000+ institutions](https://entab.in/services.html). If Entab bundles a centre module free into CampusCare, Capabble can't sell the module standalone into those schools.
- **Price threat: Pathshala and EduGradUp.** At Rs 15–17k with free setup, they set the price a principal expects. That leaves Capabble's Rs 60,000 Complete plan hard to justify on breadth.
- **Free tools.** If Eklavvya or a similar free tool adds a CBSE Form 66 template, the module's standalone value falls.

## The buyer panel

**0 buy · 20 pass** (0% buy) out of 20 simulated buyers. Seed 981133, so the same cards can be dealt again.

These are simulated buyers, not customers. Use this to find objections and weak spots, then confirm the big ones with real people before you spend.

### By segment

| group | buyers | buy rate |
| --- | ---: | ---: |
| Principal of a mid-size private CBSE school (600-1,200 students) | 8 | 0% |
| Owner/trustee of a small private school (300-600 students, fees under Rs 3,000 a month) | 6 | 0%  (thin) |
| Administrator or accounts head at a large school or a 2-3 school trust (1,200-2,000+ students) | 4 | 0%  (thin) |
| Exam-centre superintendent / senior teacher at a school that is a CBSE board exam centre | 2 | 0%  (thin) |

### By buying behaviour

| group | buyers | buy rate |
| --- | ---: | ---: |
| Price-first negotiator | 3 | 0%  (thin) |
| Already on an incumbent ERP | 5 | 0%  (thin) |
| Excel + WhatsApp + Tally | 5 | 0%  (thin) |
| Wants a person to set it up | 3 | 0%  (thin) |
| Exam-season pain buyer | 2 | 0%  (thin) |
| Asks the network | 2 | 0%  (thin) |

### By income

| group | buyers | buy rate |
| --- | ---: | ---: |
| $926,000 to $1,631,000 | 7 | 0%  (thin) |
| $1,631,000 and up | 7 | 0%  (thin) |
| under $926,000 | 6 | 0%  (thin) |

### Why they pass

| reason | buyers | in their words |
| --- | ---: | --- |
| habit | 9 | "Our current ERP works well enough, and moving fees, attendance and report cards to new software in the middle of the session could go wrong right when parents are watching. Even at half price, Rs 30,000 plus GST is over my Rs 25,000 limit, so it goes to the trust chairman, and I can't defend that to him for something we don't need right now." (P001) · "We already pay our AMC to a vendor whose people come and sort things out, and years of fee and student records sit in that system. Rs 30,000 is not the problem. The problem is moving all that data and retraining office staff who can barely use the software they have now, all for a 14-day trial I would have to run myself online." (P002) |
| trust | 7 | "The price is not the problem, half price for the first year is fair for my school. But I will not put all my students' and fee data with a new company I have never met, at least not in the middle of fee collection, and nobody has come to the school to show me anything." (P007) · "The price is fine, but I've never heard of Capabble and nobody from them has come to the school to show me. Sign up online and import our own data in a 14-day trial? My office staff won't manage that alone, and I'm not taking Rs 30,000 to the trust chairman for software I haven't seen running at a school like ours." (P008) |
| convenience | 2 | "Sign up online and run a trial with my own data? Who is going to put in 450 students and train my office staff? If nobody comes to the school, it will sit unused like the last software, and we only need fees and attendance anyway, not 14 modules." (P004) · "The price is fine for a school our size, but this is sign up online and do it yourself. My office staff are not comfortable with computers, and I don't have time to run a 14-day trial and type in 900 students' data myself after answering parents on WhatsApp till midnight." (P017) |
| timing | 2 | "Nothing is on fire this week, and I only switch software when board exams or the new session force my hand. Even the Rs 30,000 launch price plus GST goes over my Rs 25,000 limit, so it means a meeting with the trust chairman for 14 modules when we really use fees and attendance." (P006) · "It's end of October, nothing is on fire, and our Excel sheets and fee register are working well enough for now. I'd look at the exam-centre module in January when the CBSE centre work starts to hurt, not sign up for all 14 modules today." (P019) |

### Why they buy

| reason | buyers | in their words |
| --- | ---: | --- |

### What would flip a no

- A free on-site demo at our school, with you migrating our existing data for us, a switch timed for the new session in April, and a fixed multi-year per-student price that keeps it under Rs 25,000 a year so I can sign without the chairman.
- If someone from Capabble came to the school, migrated our existing fee and student data for free and trained the office staff in person, I would try only the timetable module first, since teachers fight over it every April.
- A principal from a nearby CBSE school I know telling me they have run their fees and timetable on it for a full year without trouble, plus someone coming to set it up and import our Tally data for us.
- A person visiting the school to import our student and fee data and train the office staff, with a simple fees-plus-attendance package at a fixed yearly price.
- Another CBSE exam-centre school nearby that ran a full board exam season on the exam-centre module without trouble, so I could buy only that module for about Rs 5,000 to 8,000 alongside our current ERP.
- A principal from another CBSE school nearby showing me it worked through their board exams, and a fees plus attendance bundle under Rs 25,000 that I can sign for myself before the session starts.
- Someone visits the school and gives a demo, a few nearby CBSE schools I can call who are already using it, and a written promise that I can export all my data anytime, plus a little extra discount on top of the launch price.
- Seeing it running at a nearby CBSE school our size, and a person who comes to our campus to import the data and train the staff, with that included in the price.
- Someone visiting the school to load our student and fee data and train the office staff in Hindi, with a principal I know who already uses it, and setup done outside fee collection season.
- If they migrated all our fee and student history from our current ERP for free, ran it alongside the old one until session start in April, and showed me two or three schools our size in North India using it for fees.
- Two or three CBSE schools of our size nearby that have run it for a full year and whose principals tell me fees and report cards worked without trouble, plus a person who comes to help migrate our data outside fee season.
- A principal from a nearby CBSE school telling me they ran their exam centre on it, plus someone coming to our school to load our data and train the office staff.

20 buyers gave all four price answers. Run founder-pricing's van_westendorp.py on the answers folder.

## Pricing

Inputs: `pricing-curve.md` (20 simulated buyers, Van Westendorp), `cfo.md` (what-ifs), `competitors.md`.

### 1. The price
- Panel acceptable range for the **whole school**: **Rs 10,955 to Rs 60,705 a year** (optimal ~Rs 30,900; medians: bargain Rs 25,000, expensive Rs 50,000, too expensive Rs 80,000). Simulated buyers: use it to choose what to test, not as proof.
- The list price (Rs 60,000 for 500 students) sits **at the very top** of that range. For a typical 800–1,500-student school the per-student overage makes it Rs 96,000–1.8 lakh, **above** the "too expensive" point for most of the panel (large schools/trusts answered much higher; P010 and P011 put "expensive" at Rs 2.2–2.5 lakh).
- Price was **not** the main reason anyone passed (0 of 20 gave reason code "price"). Several said "the price is fine" (P007, P008, P017, P020).
- **Competitors (from `competitors.md`):** budget vendors that publish prices charge **Rs 5,000–25,000 a year (median Rs 15,000) for a whole ~500-student school, every module included, often with free setup**. The best-known incumbents (Entab, Edunext, MyClassboard, Teachmint) hide their prices; third-party reports put MyClassboard at Rs 1.5–2.5 lakh. Capabble's Rs 60,000 is **4x the published median** while offering *less* setup help than the budget tier. That's a weak spot: more expensive than the cheap tier, less hand-holding than the expensive one.
- **Recommendation:** keep the list price only if done-for-you setup is included (that is what justifies it against Rs 15,000 budget ERPs); **do not race the budget tier on price**. Fix trust and onboarding first. The two pricing changes the panel asked for:
  1. **A signing-authority price point.** Five buyers have a **Rs 25,000 limit** above which the trust chairman must approve. Even LAUNCH50 (Rs 30,000 + GST = Rs 35,400) crosses it. Offer a **"Fees + Attendance" or "Exam Centre" starter under Rs 25,000 incl. GST**.
  2. **A single-module price for the exam-centre wedge**, sold *alongside* the incumbent ERP (P005, P012, P014, P019): the panel put it at Rs 5,000–8,000; current Rs 12,000 is above "expensive" for that segment. Test Rs 9,999 per exam season.

### 2. The ladder
- **Exam Centre** (one season, Jan–Apr): Rs 9,999. Lowest-friction entry, no data migration needed beyond CBSE PDFs.
- **Office Starter** (Fees + Students + Attendance + parent app): ≤ Rs 21,000 + GST (under the Rs 25,000 limit).
- **Complete school**: Rs 60,000 + per-student, *with done-for-you onboarding included*.
- **Trust plan**: per-group price (already offered).

### 3. The opening offer
Replace the open-ended 50%-off code with **added value with an end date**: "Free on-site setup, data import from Tally/Excel/your old ERP and staff training in Hindi for schools that sign before 31 Jan 2027". No "was Rs X" anchors that were never charged.

### 4. What to test with real buyers
- Exam Centre at **Rs 9,999 vs Rs 14,999** for the 2027 board season: pre-sell to 30 centre schools by phone/WhatsApp, count paid orders.
- Office Starter at **Rs 18,000 vs Rs 21,000** (+GST): two landing-page versions, count trial starts that book an on-site setup.

### 5. The panel's price objections, verbatim (research, not testimonials)
- "Even at half price, Rs 30,000 plus GST is over my Rs 25,000 limit, so it goes to the trust chairman" (P001)
- "a fees and attendance bundle under Rs 25,000 that I can sign for myself" (P006)
- "buy only that module for about Rs 5,000 to 8,000 alongside our current ERP" (P005)

## The offer

Built from `panel/results.md` (why 20 of 20 passed), `board.md` and `cfo.md`. Method: the Offers lens.

### The problem list (buyer's words, from the panel)
Before buying: never heard of you · nobody I know uses it · will the company exist in 3 years · over my Rs 25,000 signing limit · I only need fees + attendance, not 14 modules · can it do CBSE registration / report cards · I need to see it at a school like ours · salespeople call me every month.
Switching: who enters 450–1,800 students' data · fee history must match Tally · old ERP's years of records · mid-session switch is risky · fee-collection season is the worst time · my office staff aren't good with computers · training in Hindi.
After: who picks up the phone in exam week · will parents use the app · can I get my data out if I leave · what if fees break in front of parents.

### Solutions, scored (value 1–5 / cost 1–5)
| solution | kills | value | cost |
|---|---|---|---|
| On-site (or video) setup + data import from Tally/Excel/old ERP | "who enters the data" (top 2 reasons) | 5 | 3 |
| Staff training in Hindi, 2 sessions | "staff not good with computers" | 5 | 2 |
| Run in parallel with the old system for one fee cycle / until April | "mid-session switch is risky" | 4 | 1 |
| Written data-export promise (the export already exists: workspace archive) | "what if you shut down" | 4 | 1 |
| 3 reference schools nearby, with phone numbers | "nobody I know uses it" | 5 | 3 (must earn them) |
| Exam-week WhatsApp/phone hotline (Feb–Apr) | "who picks up in exam week" | 4 | 2 |
| Sub-Rs 25,000 starter bundle | signing limit | 4 | 1 |

### The stack
- **Core:** "Run your CBSE board-exam centre without a single paper register: seating, duties, Form 66, dispatch from CBSE's own PDFs."
- **Bonus 1:** we set it up for you: import your CBSE datesheet and candidates, train your staff in Hindi.
- **Bonus 2:** exam-week hotline, a named person, Feb–Apr.
- **Bonus 3:** your data, always yours: one-click export of everything, in writing.
- **Guarantee:** "If your centre isn't fully set up and running in Capabble 7 days before the first board paper, you pay nothing." Cost at a realistic 10% claim rate on Rs 9,999 ≈ Rs 1,000 per school sold: affordable.
- **Real urgency:** CBSE board exams start in February; centre setup has a hard deadline. No fake countdowns.
- **Name:** "Exam Centre, Done For You".
- Then expand: once the school's candidates and staff are in, offer Office Starter at session start (April).

### Value equation (1–10), before → after
- Dream outcome: 5 → 7 (from "14 modules" to "an error-free board exam season")
- Perceived likelihood: 2 → 6 (references, guarantee, export promise)
- Time to result: 4 → 7 (we import the data; one season)
- Effort and sacrifice: 2 → 7 (done for you, no migration of the whole school)

### Re-test
**Not run yet.** The skill re-runs `/founder-consumer --quick` with this pitch and the same seed (981133). Do this next and compare with 0/20. Caveat: the panel can't simulate "a principal I know vouches for it". Only real reference schools can test that.

## The numbers

> The tool prints "$" and "a day": here every amount is **Indian rupees (Rs)** and every "a day" means **paying schools in that month** (one unit = one school for one month). All cost inputs except the price basis are **estimates** (see `cfo-sources.md`); replace them with real figures.

- **The margin:** each paying school-month leaves Rs 2,906 after its own costs (73%) at the blended year-1 price of Rs 4,000. At the planned 40 paying schools the business still loses 29% of revenue, because fixed costs (~Rs 1.62 lakh/month, mostly people) need **56 paying schools** to break even.
- **The line to watch: LAUNCH50 and the per-school price.** At Rs 4,000 (half price) break-even is 56 schools; at Rs 6,000 it is 34; at full price Rs 8,000 (an ~800-student school) it is 24, and margin at plan goes from -29% to +36%. The half-price launch offer roughly doubles the number of schools needed to break even.
- **Cash:** on these estimates, year 1 loses ~Rs 13.1 lakh and needs ~Rs 13.8 lakh of cash before it pays for itself. At half the planned ramp, the loss is ~Rs 16.3 lakh.
- **Three ways to improve the margin (from the tool):**
  1. Drop LAUNCH50 / charge full price: Rs 4,000 -> 8,000 cuts break-even 56 -> 24 schools, year 1 -13.1L -> -4.3L.
  2. Charge for onboarding separately (what buyers asked for): turns the Rs 800/school-month support estimate into revenue instead of cost.
  3. Sell to trusts (2-3 schools per deal): one sale, several school-months, same fixed cost.
- **Board money conditions:** not met. Real paying-school counts and the true fixed costs are still missing.
- An accountant should check structure, GST treatment, payroll and tax. Not financial advice.

## Unit economics: Capabble school ERP (unit = one paying school for one month; 'per day' fields mean paying schools in that month)

Every number below comes from the input file. Nothing is looked up or guessed.

### One school-month

| line | per school-month |
| --- | ---: |
| Price | $4,000.00 |
| Razorpay fee ~2% + GST on fee (ESTIMATE, on Rs 4,000) | -$94.00 |
| Hosting share: tenant MongoDB storage/backup, push, email (ESTIMATE) | -$200.00 |
| Support + onboarding time, ~2 h/month at Rs 400/h (ESTIMATE) | -$800.00 |
| **Contribution** (what each school-month leaves to pay the fixed costs) | **$2,906.00** (73%) |

### The margin that matters

Fixed costs: $162,000 a month (Founder draw (ESTIMATE - replace with real) $100,000, One implementation/sales person (ESTIMATE) $35,000, Travel for on-site demos and onboarding (ESTIMATE) $15,000, Base infra: EC2, MongoDB cluster, Vercel, Neon, SMTP, domains (ESTIMATE) $12,000).

- **Break-even: 56 school-months a day.** Below that you lose money every month.
- **Profit margin at your plan** (40 a day): **-29%** of every sale, after every cost.

### Year 1, month by month

| month | school-months a day | revenue | profit | cumulative (after $70,000 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 2 | $8,000 | -$156,188 | -$226,188 |
| 2 | 4 | $16,000 | -$150,376 | -$376,564 |
| 3 | 6 | $24,000 | -$144,564 | -$521,128 |
| 4 | 9 | $36,000 | -$135,846 | -$656,974 |
| 5 | 12 | $48,000 | -$127,128 | -$784,102 |
| 6 | 15 | $60,000 | -$118,410 | -$902,512 |
| 7 | 18 | $72,000 | -$109,692 | -$1,012,204 |
| 8 | 22 | $88,000 | -$98,068 | -$1,110,272 |
| 9 | 26 | $104,000 | -$86,444 | -$1,196,716 |
| 10 | 30 | $120,000 | -$74,820 | -$1,271,536 |
| 11 | 35 | $140,000 | -$60,290 | -$1,331,826 |
| 12 | 40 | $160,000 | -$45,760 | -$1,377,586 |

- **Year 1 operating profit: -$1,307,586** on $876,000 of revenue.
- After the $70,000 startup spend: -$1,377,586.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$1,377,586**.

### What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | -29% | 56 | -$1,307,586 |
| Price -10% | -43% | 65 | -$1,395,186 |
| Volume -20% | -54% | 56 | -$1,434,869 |
| Unit costs +15% | -33% | 60 | -$1,343,524 |

### Red flags

- Year 1 loses money on operations (-$1,307,586).
- The startup spend is not earned back within year 1.

## Marketing

### Positioning (recommended)
For **the superintendent and principal of a CBSE board-exam centre school in North India**, who dread February–April paperwork (seating, duties, Form 66, dispatch), **Capabble Exam Centre** is the exam-centre software that **we set up for you from CBSE's own PDFs**, unlike general school ERPs, which treat board-exam centre work as a side feature and leave you with spreadsheets.
(Alternatives considered: "the school ERP a one-person office can run" and "fees + attendance under Rs 25,000". Both are weaker: they fight incumbents head on.)
Caveat from `competitors.md`: **Schoolites** already sells "Board Exam Compliance and Exam Center Management" (price hidden, demo-led), so the gap is narrower than "nobody does it". Capabble's edge has to be CBSE-PDF import, Form 66 and done-for-you setup, sold standalone next to any ERP.
Evidence: exam-season and exam-centre buyers (P005, P012, P014, P019) were the only ones who named a concrete module they'd buy. Every buyer asked for done-for-you setup and nearby references.

### Channels (pick 3)
1. **Direct outreach to CBSE exam-centre schools** in Haryana/NCR (centre lists come from CBSE regional office circulars): phone + WhatsApp + a 15-min video demo on *their* datesheet. Cheap; measure demos booked per 50 calls.
2. **Principal networks / sahodaya school complexes and trust chairmen:** one talk at a cluster meeting reaches 20–40 principals. Measure sign-ups per meeting.
3. **Referral from the first centres:** a free year of Exam Centre for each referred centre that pays.
Not doing now: paid social and Google Ads (buyers decide by network, not ads), app-store marketing.

### 30-day campaign (from today, 30 Oct 2026)
- Week 1: list 100 centre schools within 2 hours' drive; record a 3-min Hindi demo on a real CBSE datesheet PDF.
- Week 2: 50 calls; offer 10 free "Exam Centre, Done For You" pilots to build references.
- Week 3: on-site setups for pilots; ask each for a reference call permission.
- Week 4: cluster-meeting talk; pre-sell paid seasons at Rs 9,999 (test vs 14,999).
Hooks (each answers a panel objection): "Form 66 in 10 minutes, not 2 days" · "We load your CBSE datesheet for you" · "Keep your current ERP, add only exam centre" · "Under Rs 25,000, no chairman meeting" · "Your data exports in one click, always" · "Hindi training at your school" · "Ask [reference school] how their March went".

### Numbers
- Most you can pay to win a school: contribution Rs 2,906/school-month × ~12 months in year 1 ≈ **Rs 35,000** (less if they churn). Field sales costs must stay under that.
- Weekly: demos booked, pilots live, paid pre-sales. Change something if <5 demos per 50 calls.
- Rules: panel quotes are research, never use them as testimonials in ads.

## Launch plan

### Step 1: the real test, before spending more on modules
- **Test:** pre-sell "Exam Centre, Done For You" to CBSE centre schools at Rs 9,999 (and 14,999) for the Feb–Apr 2027 board season.
- **Success line (write it down now):** **10 paid centre schools by 15 Jan 2027** from ~100 contacted, plus 3 willing reference schools.
- Panel predicted 0% for the current self-serve offer; if real buyers also come in under 5 paid, go back to `/founder-offer` (probably the problem is trust/distribution, not price).

### Step 2: countdown
- Nov wk1–2: hide or mark "coming soon" for thin modules (Library, Medical) on capabble.cloud/pricing; add Exam Centre landing page + Hindi demo. *(critical path)*
- Nov wk2–Dec: outreach (marketing.md), 10 free pilots, references.
- Dec: written export promise + guarantee in the terms; exam-week hotline number.
- Jan 1–15: paid pre-sales; centre data import for each buyer. *(critical path: CBSE datesheet release)*
- Feb–Apr: board season; daily check-ins with each centre.
- Apr: offer Office Starter to every exam-centre school for the new session.

### Step 3: launch day (first board paper)
Hotline staffed 7am–3pm; checklist per centre (seating printed, duties sent, Form 66 ready); log every issue.

### Step 4: the first 30 days
Track: centres live, issues per centre per exam day, NPS after season, conversion to Office Starter in April. Reviews on day 7, 14, 30 of the season.

## Not done yet

- Brand: run /founder-brand
- Operations: run /founder-ops

_The panel is simulated buyers and the numbers are projections from your inputs. Confirm demand with real customers and costs with real quotes before you spend. Not financial, legal or tax advice._
