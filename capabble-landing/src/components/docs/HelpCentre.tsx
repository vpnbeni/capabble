"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  Clock,
  LayoutGrid,
  LogIn,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { HelpTopic } from "@/lib/legalContent";
import { jumpToSection } from "./ContentsNav";

const ICON = { strokeWidth: 1.75, "aria-hidden": true } as const;

// Topic icons are named in help-faq.json by their Lucide name.
const TOPIC_ICONS: Record<string, LucideIcon> = {
  "log-in": LogIn,
  "building-2": Building2,
  "layout-grid": LayoutGrid,
  "shield-check": ShieldCheck,
};

type Contact = { email: string; phone: string; hours: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Question({ q, a, topic, open }: { q: string; a: string; topic?: string; open?: boolean }) {
  return (
    <details open={open}>
      <summary>
        <span className="cb-help-q">
          {topic ? <span className="cb-help-q-topic">{topic}</span> : null}
          {q}
        </span>
        <ChevronDown className="cb-help-chevron" size={20} {...ICON} />
      </summary>
      <p className="cb-help-a">{a}</p>
    </details>
  );
}

export function HelpCentre({ topics, contact }: { topics: HelpTopic[]; contact: Contact }) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();

  const matches = useMemo(
    () =>
      term
        ? topics.flatMap((t) =>
            t.items
              .filter((it) => it.q.toLowerCase().includes(term) || it.a.toLowerCase().includes(term))
              .map((it) => ({ ...it, topic: t.title }))
          )
        : [],
    [term, topics]
  );

  // Deep link: /help?topic=signing-in (or /help#signing-in, which the browser handles itself)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("topic");
    const target = id ? document.getElementById(id) : null;
    if (target) {
      target.scrollIntoView({ block: "start" });
      target.focus({ preventScroll: true });
    }
  }, []);

  return (
    <main>
      <div className="cb-help-hero">
        <div className="cb-doc-container">
          <h1 className="cb-doc-h1">
            How can we <span className="cb-doc-accent">help?</span>
          </h1>
          <p className="cb-help-sub">
            Answers about signing in, setting up your school&apos;s account and getting into your modules.
          </p>
          <div className="cb-help-search" role="search">
            <label htmlFor="help-search">Search help</label>
            <div className="cb-help-search-control">
              <Search size={16} {...ICON} />
              <input
                id="help-search"
                type="search"
                placeholder="For example: reset email, institution code"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="cb-doc-container cb-help-main">
        {term ? (
          <section className="cb-help-block" aria-labelledby="help-results">
            <h2 className="cb-help-h2" id="help-results" aria-live="polite">
              {plural(matches.length, "answer", "answers")}
            </h2>
            {matches.length ? (
              <div className="cb-doc-card cb-help-list">
                {matches.map((m) => (
                  <Question key={m.topic + m.q} q={m.q} a={m.a} topic={m.topic} open />
                ))}
              </div>
            ) : (
              <div className="cb-doc-card cb-help-empty">
                <span className="cb-help-empty-icon">
                  <Search size={20} {...ICON} />
                </span>
                <p className="cb-help-empty-title">No answers match that search</p>
                <p>Try a shorter word, like &apos;password&apos; or &apos;code&apos;, or contact support below.</p>
              </div>
            )}
          </section>
        ) : (
          <>
            <section className="cb-help-block" aria-labelledby="help-browse">
              <h2 className="cb-help-h2" id="help-browse">
                Browse by topic
              </h2>
              <ul className="cb-help-topics">
                {topics.map((t) => {
                  const TopicIcon = TOPIC_ICONS[t.icon] ?? LayoutGrid;
                  return (
                    <li key={t.id}>
                      <a className="cb-doc-card cb-help-topic" href={`#${t.id}`} onClick={(e) => jumpToSection(e, t.id)}>
                        <span className="cb-help-topic-icon">
                          <TopicIcon size={20} {...ICON} />
                        </span>
                        <span className="cb-help-topic-title">{t.title}</span>
                        <span className="cb-help-topic-blurb">{t.blurb}</span>
                        <span className="cb-help-topic-count">{plural(t.items.length, "question", "questions")}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>

            {topics.map((t) => (
              <section key={t.id} id={t.id} className="cb-help-block" tabIndex={-1} aria-labelledby={`${t.id}-title`}>
                <h2 className="cb-help-h2" id={`${t.id}-title`}>
                  {t.title}
                </h2>
                <div className="cb-doc-card cb-help-list">
                  {t.items.map((it) => (
                    <Question key={it.q} q={it.q} a={it.a} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}

        <section className="cb-doc-card cb-help-contact" aria-labelledby="help-contact">
          <div>
            <h2 className="cb-help-h2" id="help-contact">
              Still need help?
            </h2>
            <p>
              Start with your school&apos;s Capabble admin. They can change the email on your account and turn modules on.
              For anything else, contact Capabble support.
            </p>
          </div>
          <div className="cb-help-contact-list">
            <a className="cb-help-contact-link" href={`mailto:${contact.email}`}>
              <Mail size={18} {...ICON} />
              {contact.email}
            </a>
            <a className="cb-help-contact-link" href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>
              <Phone size={18} {...ICON} />
              {contact.phone}
            </a>
            <span className="cb-help-hours">
              <Clock size={16} {...ICON} />
              {contact.hours}
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
