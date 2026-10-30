# CFO's note (read first)

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

# Unit economics: Capabble school ERP (unit = one paying school for one month; 'per day' fields mean paying schools in that month)

Every number below comes from the input file. Nothing is looked up or guessed.

## One school-month

| line | per school-month |
| --- | ---: |
| Price | $4,000.00 |
| Razorpay fee ~2% + GST on fee (ESTIMATE, on Rs 4,000) | -$94.00 |
| Hosting share: tenant MongoDB storage/backup, push, email (ESTIMATE) | -$200.00 |
| Support + onboarding time, ~2 h/month at Rs 400/h (ESTIMATE) | -$800.00 |
| **Contribution** (what each school-month leaves to pay the fixed costs) | **$2,906.00** (73%) |

## The margin that matters

Fixed costs: $162,000 a month (Founder draw (ESTIMATE - replace with real) $100,000, One implementation/sales person (ESTIMATE) $35,000, Travel for on-site demos and onboarding (ESTIMATE) $15,000, Base infra: EC2, MongoDB cluster, Vercel, Neon, SMTP, domains (ESTIMATE) $12,000).

- **Break-even: 56 school-months a day.** Below that you lose money every month.
- **Profit margin at your plan** (40 a day): **-29%** of every sale, after every cost.

## Year 1, month by month

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

## What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | -29% | 56 | -$1,307,586 |
| Price -10% | -43% | 65 | -$1,395,186 |
| Volume -20% | -54% | 56 | -$1,434,869 |
| Unit costs +15% | -33% | 60 | -$1,343,524 |

## Red flags

- Year 1 loses money on operations (-$1,307,586).
- The startup spend is not earned back within year 1.
