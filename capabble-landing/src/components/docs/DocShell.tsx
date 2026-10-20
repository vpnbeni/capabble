import type { ReactNode } from "react";
import Link from "next/link";
import { inter } from "@/lib/fonts";
import { AccountNav } from "./AccountNav";
import "./docs.css";

type Page = "help" | "privacy" | "terms" | "pricing" | "demo";

const FOOTER_LINKS: { page: Page; href: string; label: string }[] = [
  { page: "pricing", href: "/pricing", label: "Pricing" },
  { page: "privacy", href: "/privacy", label: "Privacy" },
  { page: "terms", href: "/terms", label: "Terms" },
  { page: "help", href: "/help", label: "Help" },
];

const HOME_LABELS: Record<Page, string> = { help: "Help", pricing: "Pricing", demo: "Request a demo", privacy: "Legal", terms: "Legal" };

/** Shared header and footer for the Pricing, Request a demo, Help, Privacy and Terms pages. */
export function DocShell({ page, children }: { page: Page; children: ReactNode }) {
  return (
    <div className={`cb-doc ${inter.variable}`} data-page={page}>
      <header className="cb-doc-header">
        <div className="cb-doc-container">
          <Link href="/" className="cb-doc-home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/logo.png" alt="" width={36} height={36} />
            <span className="cb-doc-wordmark">
              Capa<span>bb</span>le
            </span>
            <span className="cb-doc-home-divider" aria-hidden="true" />
            <span className="cb-doc-home-label">{HOME_LABELS[page]}</span>
          </Link>
          <AccountNav />
        </div>
      </header>

      {children}

      <footer className="cb-doc-footer">
        <div className="cb-doc-container">
          <span>© 2026 Capabble</span>
          {FOOTER_LINKS.map((l) => (
            <Link key={l.page} href={l.href} aria-current={l.page === page ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </div>
      </footer>
    </div>
  );
}
