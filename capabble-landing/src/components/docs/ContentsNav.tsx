"use client";

import type { MouseEvent } from "react";

/** Moves to an in-page section and gives it focus, so keyboard and screen-reader users land there too. */
export function jumpToSection(e: MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ block: "start" });
  target.focus({ preventScroll: true });
  history.replaceState(null, "", `#${id}`);
}

export function ContentsNav({ sections }: { sections: { id: string; title: string }[] }) {
  return (
    <nav aria-label="On this page" className="cb-legal-toc">
      <p className="cb-legal-toc-label">On this page</p>
      <ol>
        {sections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} onClick={(e) => jumpToSection(e, s.id)}>
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
