import { existsSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { DocShell } from "@/components/docs/DocShell";
import { RequestDemoPage } from "@/components/demo/RequestDemoPage";
import { legalFacts } from "@/content/legalFacts";
import { moduleGroups } from "@/content/pricing";
import "@/components/demo/demo.css";

export const metadata: Metadata = {
  title: "Request a demo | Capabble",
  description:
    "Book a free walkthrough of Capabble for your school. Tell us how you work today and we'll show you the modules that fit.",
  alternates: { canonical: "/request-demo" },
};

/*
 * Photo for the page. Drop the file at public/landing/request-demo.jpg (and request-demo-mobile.jpg)
 * and the next build shows it; until then a styled placeholder is shown.
 */
const photo = (file: string) => (existsSync(path.join(process.cwd(), "public", "landing", file)) ? `/landing/${file}` : null);

export default function RequestDemo() {
  return (
    <DocShell page="demo">
      <RequestDemoPage
        modules={moduleGroups.map((g) => ({ title: g.title, names: g.modules.map((m) => m.name) }))}
        photo={{ desktop: photo("request-demo.jpg"), mobile: photo("request-demo-mobile.jpg") }}
        contact={{
          email: legalFacts.infoEmail,
          phone: legalFacts.supportPhone,
          hours: legalFacts.supportHours,
          office: legalFacts.officeAddress,
        }}
      />
    </DocShell>
  );
}
