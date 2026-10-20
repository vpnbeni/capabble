"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock, Mail, MapPin, Phone, School } from "lucide-react";

const ICON = { strokeWidth: 1.75, "aria-hidden": true } as const;

const apiOrigin = (process.env.NEXT_PUBLIC_API_ORIGIN || "https://api.capabble.cloud").replace(/\/+$/, "");

const ROLES = ["Principal", "Director or owner", "Administrator", "Teacher or coordinator", "Accounts or office staff", "IT staff", "Other"];
const STUDENT_COUNTS = ["Under 300", "300–500", "500–1,000", "1,000–2,000", "2,000–5,000", "More than 5,000", "A group of schools"];
const TIMES = ["Weekday morning (10 am – 1 pm)", "Weekday afternoon (1 – 4 pm)", "Weekday evening (4 – 7 pm)", "Saturday", "Any time"];
const STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Outside India",
];

const STEPS = [
  { title: "We call you", text: "Within one working day, to understand how your school runs today." },
  { title: "A live walkthrough", text: "45 minutes on video or at your school, using the modules you picked." },
  { title: "A clear plan", text: "What moving over involves, how long it takes and what it costs." },
];

type Fields = {
  name: string;
  institution: string;
  role: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  studentCount: string;
  preferredTime: string;
  message: string;
  website: string;
};
type FieldName = keyof Fields;

const EMPTY: Fields = {
  name: "", institution: "", role: "", email: "", phone: "", city: "", state: "",
  studentCount: "", preferredTime: "", message: "", website: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+()\-\s0-9]{7,20}$/;

function validate(f: Fields): Partial<Record<FieldName, string>> {
  const e: Partial<Record<FieldName, string>> = {};
  if (f.name.trim().length < 2) e.name = "Enter your name.";
  if (f.institution.trim().length < 2) e.institution = "Enter your school or institution.";
  if (!EMAIL_RE.test(f.email.trim())) e.email = "Enter an email address like name@school.edu.in.";
  if (!PHONE_RE.test(f.phone.trim()) || f.phone.replace(/\D/g, "").length < 7) e.phone = "Enter a phone number we can call.";
  return e;
}

type Props = {
  modules: { title: string; names: string[] }[];
  photo: { desktop: string | null; mobile: string | null };
  contact: { email: string; phone: string; hours: string; office: string };
};

export function RequestDemoPage({ modules, photo, contact }: Props) {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [picked, setPicked] = useState<string[]>([]);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [serverError, setServerError] = useState("");

  const set = (name: FieldName) => (value: string) => {
    setFields((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const toggleModule = (name: string) =>
    setPicked((list) => (list.includes(name) ? list.filter((n) => n !== name) : [...list, name]));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "sending") return;

    const found = validate(fields);
    setErrors(found);
    const first = (Object.keys(found) as FieldName[])[0];
    if (first) {
      document.getElementById(`demo-${first}`)?.focus();
      return;
    }

    setStatus("sending");
    setServerError("");
    try {
      const response = await fetch(`${apiOrigin}/api/admin/public/demo-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.trim()])),
          modules: picked,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { success?: boolean; message?: string; details?: { message: string }[] }
        | null;
      if (!response.ok || !body?.success) {
        const message =
          response.status === 429
            ? body?.message || "Too many requests from this network. Please try again in an hour."
            : body?.details?.[0]?.message || body?.message || "We couldn't send your request.";
        throw new Error(message);
      }
      setStatus("sent");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setServerError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "We couldn't reach our server. Check your connection and try again.");
      setStatus("error");
    }
  };

  return (
    <main className="cb-demo">
      <div className="cb-doc-container cb-demo-grid">
        <section className="cb-demo-aside" aria-labelledby="demo-title">
          <p className="cb-demo-eyebrow">Free walkthrough</p>
          <h1 className="cb-doc-h1" id="demo-title">
            See Capabble with <span className="cb-doc-accent">your school&apos;s</span> own work.
          </h1>
          <p className="cb-demo-intro">
            Tell us how you run admissions, fees, exams and timetables today. We&apos;ll show you the modules that fit and
            what moving over involves. No cost, no obligation.
          </p>

          <DemoPhoto photo={photo} />

          <ol className="cb-demo-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="cb-demo-step-n" aria-hidden="true">{i + 1}</span>
                <span>
                  <strong>{s.title}</strong>
                  <span>{s.text}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="cb-demo-contact">
            <p>Rather talk now?</p>
            <a className="cb-help-contact-link" href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>
              <Phone size={18} {...ICON} />
              {contact.phone}
            </a>
            <a className="cb-help-contact-link" href={`mailto:${contact.email}`}>
              <Mail size={18} {...ICON} />
              {contact.email}
            </a>
            <span className="cb-demo-meta">
              <Clock size={16} {...ICON} />
              {contact.hours}
            </span>
            <span className="cb-demo-meta">
              <MapPin size={16} {...ICON} />
              {contact.office}
            </span>
          </div>
        </section>

        <section className="cb-doc-card cb-demo-card" aria-label="Demo request form">
          {status === "sent" ? (
            <div className="cb-demo-done" role="status">
              <span className="cb-demo-done-icon">
                <CheckCircle2 size={28} {...ICON} />
              </span>
              <h2>Thanks, {fields.name.trim().split(/\s+/)[0]}. We have your request.</h2>
              <p>
                Someone from our team will call or email you within one working day to fix a time. We&apos;ve sent a copy to{" "}
                <strong>{fields.email.trim()}</strong>.
              </p>
              <Link className="cb-demo-btn" href="/">Back to capabble.cloud</Link>
            </div>
          ) : (
            <form noValidate onSubmit={submit}>
              <h2 className="cb-demo-h2">Request a demo</h2>
              <p className="cb-demo-sub">Fields marked * are needed. It takes about a minute.</p>

              {status === "error" ? (
                <div className="cb-demo-alert" role="alert">
                  <AlertCircle size={18} {...ICON} />
                  <span>
                    {serverError} You can also write to <a href={`mailto:${contact.email}`}>{contact.email}</a>.
                  </span>
                </div>
              ) : null}

              <fieldset className="cb-demo-group">
                <legend className="cb-demo-legend">About you</legend>
                <div className="cb-demo-fields">
                <Field id="name" label="Full name" required error={errors.name}>
                  <input id="demo-name" autoComplete="name" value={fields.name} onChange={(e) => set("name")(e.target.value)} {...aria("name", errors)} />
                </Field>
                <Field id="role" label="Your role">
                  <select id="demo-role" value={fields.role} onChange={(e) => set("role")(e.target.value)}>
                    <option value="">Choose one</option>
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </Field>
                <Field id="email" label="Work email" required error={errors.email}>
                  <input id="demo-email" type="email" autoComplete="email" inputMode="email" value={fields.email} onChange={(e) => set("email")(e.target.value)} {...aria("email", errors)} />
                </Field>
                <Field id="phone" label="Phone" required error={errors.phone}>
                  <input id="demo-phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+91" value={fields.phone} onChange={(e) => set("phone")(e.target.value)} {...aria("phone", errors)} />
                </Field>
                </div>
              </fieldset>

              <fieldset className="cb-demo-group">
                <legend className="cb-demo-legend">Your school</legend>
                <div className="cb-demo-fields">
                <Field id="institution" label="School or institution" required error={errors.institution} wide>
                  <input id="demo-institution" autoComplete="organization" value={fields.institution} onChange={(e) => set("institution")(e.target.value)} {...aria("institution", errors)} />
                </Field>
                <Field id="city" label="City">
                  <input id="demo-city" autoComplete="address-level2" value={fields.city} onChange={(e) => set("city")(e.target.value)} />
                </Field>
                <Field id="state" label="State">
                  <select id="demo-state" value={fields.state} onChange={(e) => set("state")(e.target.value)}>
                    <option value="">Choose one</option>
                    {STATES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field id="studentCount" label="Number of students">
                  <select id="demo-studentCount" value={fields.studentCount} onChange={(e) => set("studentCount")(e.target.value)}>
                    <option value="">Choose one</option>
                    {STUDENT_COUNTS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field id="preferredTime" label="Best time for the demo">
                  <select id="demo-preferredTime" value={fields.preferredTime} onChange={(e) => set("preferredTime")(e.target.value)}>
                    <option value="">Choose one</option>
                    {TIMES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                </div>
              </fieldset>

              <fieldset className="cb-demo-group cb-demo-modules">
                <legend className="cb-demo-legend">
                  Modules you want to see <span>Optional. Pick any.</span>
                </legend>
                {modules.map((g) => (
                  <div key={g.title} className="cb-demo-module-group">
                    <span className="cb-demo-module-title">{g.title}</span>
                    <div className="cb-demo-chips">
                      {g.names.map((n) => (
                        <label key={n} className="cb-demo-chip" data-on={picked.includes(n) ? "" : undefined}>
                          <input type="checkbox" checked={picked.includes(n)} onChange={() => toggleModule(n)} />
                          {n}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </fieldset>

              <Field id="message" label="Anything we should know?" wide>
                <textarea
                  id="demo-message"
                  rows={4}
                  maxLength={2000}
                  placeholder="For example: we use spreadsheets for fees and want report cards online before March."
                  value={fields.message}
                  onChange={(e) => set("message")(e.target.value)}
                />
              </Field>

              {/* Honeypot: hidden from people and screen readers; bots that fill it are dropped by the server. */}
              <div className="cb-demo-hp" aria-hidden="true">
                <label htmlFor="demo-website">Website</label>
                <input id="demo-website" name="website" tabIndex={-1} autoComplete="off" value={fields.website} onChange={(e) => set("website")(e.target.value)} />
              </div>

              <div className="cb-demo-submit">
                <button type="submit" className="cb-demo-btn" data-primary="" disabled={status === "sending"}>
                  {status === "sending" ? "Sending…" : "Request my demo"}
                </button>
                <p>
                  We use these details only to arrange your demo. See our <a href="/privacy">privacy policy</a>.
                </p>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

function aria(name: FieldName, errors: Partial<Record<FieldName, string>>) {
  return errors[name]
    ? { "aria-invalid": true as const, "aria-describedby": `demo-${name}-error` }
    : {};
}

function Field({ id, label, required, error, wide, children }: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="cb-demo-field" data-wide={wide ? "" : undefined} data-invalid={error ? "" : undefined}>
      <label htmlFor={`demo-${id}`}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {error ? (
        <span className="cb-demo-error" id={`demo-${id}-error`}>
          <AlertCircle size={14} {...ICON} />
          {error}
        </span>
      ) : null}
    </div>
  );
}

function DemoPhoto({ photo }: { photo: Props["photo"] }) {
  const alt = "A Capabble team member walks a school principal and office staff through the software";
  if (!photo.desktop) {
    return (
      <div className="cb-demo-photo cb-demo-photo-ph" role="img" aria-label={alt}>
        <School size={32} {...ICON} />
      </div>
    );
  }
  return (
    <picture>
      {photo.mobile ? <source media="(max-width: 640px)" srcSet={photo.mobile} /> : null}
      <img className="cb-demo-photo" src={photo.desktop} alt={alt} width={1200} height={800} />
    </picture>
  );
}
