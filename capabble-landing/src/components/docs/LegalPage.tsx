import Link from "next/link";
import Markdown, { type Components } from "react-markdown";
import { loadLegalDoc } from "@/lib/legalContent";
import { DocShell } from "./DocShell";
import { ContentsNav } from "./ContentsNav";

// The markdown links to the app's hash routes (#/privacy, #/help); on this site they are real paths.
const toSitePath = (href = "") => (href.startsWith("#/") ? href.slice(1) : href);

const markdownComponents: Components = {
  a: ({ href, children }) => {
    const path = toSitePath(href);
    return path.startsWith("/") ? <Link href={path}>{children}</Link> : <a href={path}>{children}</a>;
  },
};

const TABS = [
  { kind: "privacy", href: "/privacy", label: "Privacy policy" },
  { kind: "terms", href: "/terms", label: "Terms of use" },
] as const;

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const doc = loadLegalDoc(kind);

  return (
    <DocShell page={kind}>
      <main>
        <div className="cb-legal-hero">
          <div className="cb-doc-container">
            <nav aria-label="Legal pages" className="cb-legal-tabs">
              {TABS.map((t) => (
                <Link key={t.kind} href={t.href} aria-current={t.kind === kind ? "page" : undefined}>
                  {t.label}
                </Link>
              ))}
            </nav>
            <h1 className="cb-doc-h1">{doc.title}</h1>
            <p className="cb-legal-updated">{doc.lastUpdated}</p>
            <section className="cb-doc-card cb-legal-short" aria-labelledby="short-version">
              <h2 id="short-version">The short version</h2>
              <ul>
                {doc.shortVersion.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <div className="cb-doc-container cb-legal-body">
          <ContentsNav sections={doc.sections.map(({ id, title }) => ({ id, title }))} />
          <article className="cb-legal-article">
            {doc.sections.map((s) => (
              <section key={s.id} id={s.id} className="cb-legal-section" tabIndex={-1} aria-labelledby={`${s.id}-title`}>
                <h2 id={`${s.id}-title`}>{s.title}</h2>
                <Markdown components={markdownComponents}>{s.body}</Markdown>
              </section>
            ))}
          </article>
        </div>
      </main>
    </DocShell>
  );
}
