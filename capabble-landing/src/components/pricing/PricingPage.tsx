"use client";

import { Fragment, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Hourglass,
  LayoutGrid,
  Minus,
  School,
  Search,
  type LucideIcon,
} from "lucide-react";
import { getSchoolOsOrigin, SCHOOL_OS_ORIGIN } from "@/lib/schoolOs";
import {
  completeListPrice,
  completePerStudent,
  completePrice,
  GST_RATE,
  INCLUDED_STUDENTS,
  inr,
  LAUNCH_CODE,
  lowestModulePrice,
  MODULE_COUNT,
  moduleGroups,
  modulePerStudent,
  modulePrice,
  TRIAL_DAYS,
  type Interval,
} from "@/content/pricing";

const ICON = { strokeWidth: 1.75, "aria-hidden": true } as const;
const noop = () => () => {};
const per = (interval: Interval) => (interval === "year" ? "a year" : "a month");

type Contact = { email: string; phone: string; hours: string };
type Cell = boolean | string;
type Row = { label: string; hint?: string; cells: [Cell, Cell, Cell] };
type Group = { title: string; rows: Row[] };

const PLAN_NAMES = ["Free trial", "Pick modules", "Complete school"] as const;

function useSchoolOs() {
  return useSyncExternalStore(noop, () => getSchoolOsOrigin(window.location.host), () => SCHOOL_OS_ORIGIN);
}

function PlanCard({
  icon: Glyph,
  name,
  tagline,
  price,
  priceNote,
  cta,
  href,
  featured,
  offer,
  lead,
  points,
}: {
  icon: LucideIcon;
  name: string;
  tagline: string;
  price: ReactNode;
  priceNote: ReactNode;
  cta: string;
  href: string;
  featured?: boolean;
  offer?: ReactNode;
  lead: string;
  points: string[];
}) {
  return (
    <article className="cb-plan" data-featured={featured ? "" : undefined}>
      <span className="cb-plan-icon">
        <Glyph size={22} {...ICON} />
      </span>
      <h2 className="cb-plan-name">{name}</h2>
      <p className="cb-plan-tagline">{tagline}</p>
      <div className="cb-plan-price">{price}</div>
      <p className="cb-plan-note">{priceNote}</p>
      <a className="cb-plan-cta" data-primary={featured ? "" : undefined} href={href}>
        {cta}
      </a>
      {offer ? <p className="cb-plan-offer">{offer}</p> : null}
      <p className="cb-plan-lead">{lead}</p>
      <ul className="cb-plan-points">
        {points.map((p) => (
          <li key={p}>
            <Check size={16} {...ICON} />
            {p}
          </li>
        ))}
      </ul>
    </article>
  );
}

function CellValue({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <span className="cb-cmp-yes">
        <Check size={14} strokeWidth={2.5} aria-hidden="true" />
        <span className="cb-visually-hidden">Included</span>
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="cb-cmp-no">
        <Minus size={16} {...ICON} />
        <span className="cb-visually-hidden">Not included</span>
      </span>
    );
  }
  return <span className="cb-cmp-text">{value}</span>;
}

const FAQ: { tab: string; items: { q: string; a: string }[] }[] = [
  {
    tab: "Plans and prices",
    items: [
      {
        q: "What does the Complete school plan include?",
        a: `All ${MODULE_COUNT} Capabble modules for one price, for up to ${INCLUDED_STUDENTS} students. Staff, parent and student logins are never charged for.`,
      },
      {
        q: "Can I start with one module and add more later?",
        a: "Yes. Buy only the modules you need. When you add one partway through a billing period you pay for the days that are left, and your data is shared with the modules you already use. Once your modules cost more than the Complete school plan, switch to it.",
      },
      {
        q: "How are students counted?",
        a: `Every price covers up to ${INCLUDED_STUDENTS} students. We bill the higher of the number you tell us and the active students in your Students module. Each student above ${INCLUDED_STUDENTS} is billed at the same rate as the ones included, so the price grows in step with your school.`,
      },
      {
        q: "Is yearly or monthly billing cheaper?",
        a: `Yearly. The Complete school plan is ${inr(completePrice("year"))} a year, or ${inr(completePrice("month"))} a month (${inr(completePrice("month") * 12)} over twelve months).`,
      },
      {
        q: "We run several schools. Is there a group price?",
        a: "Yes. Each school has its own account and database, and trusts and school groups get one price across them. Write to us and we'll put it together.",
      },
    ],
  },
  {
    tab: "Trial and launch offer",
    items: [
      {
        q: "How does the free trial work?",
        a: `Choose the modules you plan to keep and start a ${TRIAL_DAYS}-day trial. Every module is open while it runs. We remind you before it ends, and you pay only when the trial is over. One free trial per school.`,
      },
      {
        q: `What is the ${LAUNCH_CODE} launch offer?`,
        a: `Enter ${LAUNCH_CODE} when you choose your plan and your first invoice is half price. On yearly billing that is your whole first year: the Complete school plan is ${inr(completePrice("year") / 2)} instead of ${inr(completePrice("year"))}. On monthly billing it covers your first month.`,
      },
      {
        q: "Does the offer work with single modules?",
        a: `Yes. ${LAUNCH_CODE} takes half off your first invoice whichever modules you choose.`,
      },
      {
        q: "Can I cancel during the trial?",
        a: "Yes. Cancel from Billing before the trial ends and you won't be charged.",
      },
    ],
  },
  {
    tab: "Billing and GST",
    items: [
      {
        q: "Do prices include GST?",
        a: `No. GST at ${GST_RATE}% is added to every invoice: CGST and SGST if your school is in Haryana, IGST otherwise. Add your GSTIN in Billing and it is printed on your invoices.`,
      },
      {
        q: "How can we pay?",
        a: "By UPI, card or net banking through Razorpay, or by bank transfer against the invoice. You can also set up autopay so renewals are paid on time.",
      },
      {
        q: "What happens if a payment is late?",
        a: "Everything keeps working for a short grace period while we remind you. After that your school can still sign in and read its data, but can't make changes until the invoice is paid.",
      },
      {
        q: "Do we get proper invoices and receipts?",
        a: "Yes. Every invoice is a GST invoice with its own number, and every payment gets a receipt. Both can be downloaded from Billing at any time.",
      },
    ],
  },
];

export function PricingPage({ contact }: { contact: Contact }) {
  const origin = useSchoolOs();
  const signup = `${origin}/#/signup`;
  const sales = `mailto:${contact.email}?subject=Capabble%20pricing%20for%20our%20schools`;
  const [interval, setBillingInterval] = useState<Interval>("year");
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [faqTab, setFaqTab] = useState(0);

  const complete = completePrice(interval);

  const groups: Group[] = useMemo(
    () => [
      ...moduleGroups.map((g) => ({
        title: g.title,
        rows: g.modules.map(
          (m): Row => ({
            label: m.name,
            hint: m.text,
            cells: [true, `${inr(modulePrice(m, interval))} ${per(interval)}`, true],
          })
        ),
      })),
      {
        title: "Students",
        rows: [
          { label: "Students included", cells: [`Up to ${INCLUDED_STUDENTS}`, `Up to ${INCLUDED_STUDENTS}`, `Up to ${INCLUDED_STUDENTS}`] },
          {
            label: `Each student above ${INCLUDED_STUDENTS}`,
            hint: "Billed at the same rate as the students included",
            cells: [
              "Free",
              `${inr(Math.min(...moduleGroups.flatMap((g) => g.modules.map((m) => modulePerStudent(m, interval)))))}–${inr(
                Math.max(...moduleGroups.flatMap((g) => g.modules.map((m) => modulePerStudent(m, interval))))
              )} per module`,
              `${inr(completePerStudent(interval))} ${per(interval)}`,
            ],
          },
          { label: "Staff, parent and student logins", cells: ["Not charged", "Not charged", "Not charged"] },
        ],
      },
      {
        title: "Your school's data",
        rows: [
          { label: "A separate database for your school", cells: [true, true, true] },
          { label: "Roles and permissions for every login", cells: [true, true, true] },
          { label: "Family portal for parents and students", cells: [true, true, true] },
          { label: "Modules share data when used together", cells: [true, true, true] },
        ],
      },
      {
        title: "Billing and payments",
        rows: [
          { label: `${LAUNCH_CODE}: half off your first invoice`, cells: [false, true, true] },
          { label: "GST invoices and receipts", cells: [false, true, true] },
          { label: "UPI, card, net banking or bank transfer", cells: [false, true, true] },
          { label: "Autopay for renewals", cells: [false, true, true] },
          { label: "Add or remove modules any time", hint: "Pay only for the days left", cells: [true, true, "All included"] },
        ],
      },
      {
        title: "Support",
        rows: [
          { label: "Help centre", cells: [true, true, true] },
          { label: "Email and phone support", hint: contact.hours, cells: [true, true, true] },
        ],
      },
    ],
    [interval, contact.hours]
  );

  const term = query.trim().toLowerCase();
  const visible = groups
    .map((g) => ({
      ...g,
      rows: term ? g.rows.filter((r) => `${r.label} ${r.hint || ""}`.toLowerCase().includes(term)) : g.rows,
    }))
    .filter((g) => g.rows.length);

  return (
    <main className="cb-price">
      <section className="cb-price-hero cb-doc-container">
        <h1 className="cb-doc-h1">Pricing</h1>
        <p className="cb-price-intro">
          One price for your whole school, or only the modules you need. Every plan starts with a free {TRIAL_DAYS}-day
          trial.
        </p>

        <div className="cb-interval" role="radiogroup" aria-label="Billing period">
          {(["year", "month"] as Interval[]).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={interval === value}
              onClick={() => setBillingInterval(value)}
            >
              {value === "year" ? "Yearly" : "Monthly"}
            </button>
          ))}
        </div>

        <div className="cb-plans">
          <PlanCard
            icon={Hourglass}
            name="Free trial"
            tagline="See it working with your school's data"
            price={inr(0)}
            priceNote={`for ${TRIAL_DAYS} days`}
            cta="Start free trial"
            href={signup}
            lead="During the trial:"
            points={[
              `Every one of the ${MODULE_COUNT} modules open`,
              "Your own school account and database",
              "Staff, parent and student logins",
              "Reminders before the trial ends",
              "Cancel any time before it ends",
            ]}
          />
          <PlanCard
            icon={LayoutGrid}
            name="Pick modules"
            tagline="Start small and add modules as you grow"
            price={
              <>
                <span className="cb-plan-from">From</span> {inr(lowestModulePrice(interval))}
              </>
            }
            priceNote={`per module, ${per(interval)}, up to ${INCLUDED_STUDENTS} students`}
            cta="Create account"
            href={signup}
            lead="Everything in the trial, plus:"
            points={[
              "Only the modules you choose",
              "Add or remove modules any time",
              "Modules share data when used together",
              "GST invoices, receipts and autopay",
              `${LAUNCH_CODE}: half off your first invoice`,
            ]}
          />
          <PlanCard
            featured
            icon={School}
            name="Complete school"
            tagline="Every module for one price"
            price={
              <>
                {inr(complete)}
                <s className="cb-plan-was" aria-label={`instead of ${inr(completeListPrice(interval))}`}>
                  {inr(completeListPrice(interval))}
                </s>
              </>
            }
            priceNote={`${per(interval)}, up to ${INCLUDED_STUDENTS} students`}
            cta="Start with Complete school"
            href={signup}
            offer={
              <>
                <strong>Launch offer:</strong> {interval === "year" ? "your first year" : "your first month"} for{" "}
                {inr(complete / 2)} with code <code>{LAUNCH_CODE}</code>
              </>
            }
            lead="Everything in Pick modules, plus:"
            points={[
              `All ${MODULE_COUNT} modules, half the price of buying them one by one`,
              `${inr(completePerStudent(interval))} ${per(interval)} for each student above ${INCLUDED_STUDENTS}`,
              "One invoice for the whole school",
            ]}
          />
        </div>

        <p className="cb-price-fine">
          Prices exclude GST ({GST_RATE}%). Each price covers up to {INCLUDED_STUDENTS} students; every student above that
          is billed at the same rate. Running several schools?{" "}
          <a href={sales}>Ask about group pricing</a>.
        </p>
      </section>

      <section className="cb-cmp cb-doc-container" aria-labelledby="compare-title">
        <h2 id="compare-title" className="cb-price-h2">
          Compare plans
        </h2>

        <div className="cb-cmp-table" role="table" aria-label="Plan comparison">
          <div className="cb-cmp-head" role="row">
            <div className="cb-cmp-search" role="columnheader">
              <Search size={16} {...ICON} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                aria-label="Search features and modules"
              />
            </div>
            {PLAN_NAMES.map((name, i) => (
              <div key={name} className="cb-cmp-plan" role="columnheader">
                <span>{name}</span>
                <a href={signup} data-primary={i === 2 ? "" : undefined}>
                  {i === 0 ? "Try free" : "Get started"}
                </a>
              </div>
            ))}
          </div>

          {visible.map((g) => {
            const isClosed = !term && closed[g.title];
            return (
              <Fragment key={g.title}>
                <div className="cb-cmp-group" role="row">
                  <div role="cell">
                    <button
                      type="button"
                      aria-expanded={!isClosed}
                      onClick={() => setClosed((c) => ({ ...c, [g.title]: !c[g.title] }))}
                    >
                      {g.title}
                      <ChevronDown size={18} {...ICON} />
                    </button>
                  </div>
                </div>
                {isClosed
                  ? null
                  : g.rows.map((r) => (
                      <div key={r.label} className="cb-cmp-row" role="row">
                        <div className="cb-cmp-label" role="rowheader">
                          {r.label}
                          {r.hint ? <span>{r.hint}</span> : null}
                        </div>
                        {r.cells.map((c, i) => (
                          <div key={PLAN_NAMES[i]} className="cb-cmp-cell" role="cell">
                            <span className="cb-cmp-cell-plan" aria-hidden="true">
                              {PLAN_NAMES[i]}
                            </span>
                            <CellValue value={c} />
                          </div>
                        ))}
                      </div>
                    ))}
              </Fragment>
            );
          })}
          {!visible.length ? <p className="cb-cmp-empty">Nothing matches “{query}”.</p> : null}
        </div>
      </section>

      <section className="cb-faq cb-doc-container" aria-labelledby="faq-title">
        <h2 id="faq-title" className="cb-price-h2">
          Questions
        </h2>
        <div className="cb-faq-tabs" role="tablist" aria-label="Question topics">
          {FAQ.map((t, i) => (
            <button
              key={t.tab}
              type="button"
              role="tab"
              id={`faq-tab-${i}`}
              aria-selected={faqTab === i}
              aria-controls="faq-panel"
              onClick={() => setFaqTab(i)}
            >
              {t.tab}
            </button>
          ))}
        </div>
        <div className="cb-faq-list" role="tabpanel" id="faq-panel" aria-labelledby={`faq-tab-${faqTab}`}>
          {FAQ[faqTab].items.map((it) => (
            <details key={it.q}>
              <summary>
                {it.q}
                <ChevronDown size={20} {...ICON} />
              </summary>
              <p>{it.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="cb-price-cta cb-doc-container">
        <div>
          <h2 className="cb-price-h2">Try it with your school&apos;s data</h2>
          <p>
            {TRIAL_DAYS} days, every module, free. Questions first? Call {contact.phone} or write to{" "}
            <a href={`mailto:${contact.email}`}>{contact.email}</a>.
          </p>
        </div>
        <a className="cb-plan-cta" data-primary="" href={signup}>
          Start free trial
          <ArrowRight size={18} {...ICON} />
        </a>
      </section>
    </main>
  );
}
