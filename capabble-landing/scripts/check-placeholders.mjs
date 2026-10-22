// Fails the production build while the Help, Privacy or Terms pages still show a
// "[…]" placeholder (support email, retention periods, legal entity and so on).
// Fill shared facts in src/content/legalFacts.ts and the rest in the markdown files.
//
// Runs after `next build` against the prerendered HTML. It fails only for Vercel
// production builds (or with STRICT_PLACEHOLDERS=1); elsewhere it just warns.

import fs from "node:fs";
import path from "node:path";

const PAGES = ["help", "privacy", "terms"];
const strict = process.env.VERCEL_ENV === "production" || process.env.STRICT_PLACEHOLDERS === "1";
const nextDir = path.join(process.cwd(), ".next");

// A plain `next build` leaves the HTML in .next/server/app. On Vercel the build
// adapter (onBuildComplete) writes it into .next/output instead: static pages as
// static/<page>.html, ISR-capable pages as functions/<page>.prerender-fallback.html.
const candidates = (page) => [
  path.join(nextDir, "server/app", `${page}.html`),
  path.join(nextDir, "output/static", `${page}.html`),
  path.join(nextDir, "output/functions", `${page}.prerender-fallback.html`),
];

const visibleText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

let total = 0;
for (const page of PAGES) {
  const file = candidates(page).find((f) => fs.existsSync(f));
  if (!file) {
    console.error(`[placeholders] ${page}: no prerendered HTML at any of\n  ${candidates(page).join("\n  ")}`);
    process.exit(1);
  }
  const found = [...new Set(visibleText(fs.readFileSync(file, "utf8")).match(/\[[^\]]{1,160}\]/g) ?? [])];
  if (found.length) {
    total += found.length;
    console.log(`[placeholders] /${page}: ${found.join(", ")}`);
  }
}

if (!total) {
  console.log("[placeholders] none rendered");
} else if (strict) {
  console.error(`[placeholders] ${total} placeholder(s) still rendered; refusing a production build.`);
  process.exit(1);
} else {
  console.warn(`[placeholders] ${total} placeholder(s) still rendered (allowed outside production).`);
}
