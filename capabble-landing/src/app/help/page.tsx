import type { Metadata } from "next";
import { DocShell } from "@/components/docs/DocShell";
import { HelpCentre } from "@/components/docs/HelpCentre";
import { legalFacts } from "@/content/legalFacts";
import { helpTopics } from "@/lib/legalContent";

export const metadata: Metadata = {
  title: "Help centre | Capabble",
  description: "Answers about signing in, setting up your school's account and getting into your modules.",
  alternates: { canonical: "/help" },
};

export default function HelpPage() {
  return (
    <DocShell page="help">
      <HelpCentre
        topics={helpTopics}
        contact={{ email: legalFacts.supportEmail, phone: legalFacts.supportPhone, hours: legalFacts.supportHours }}
      />
    </DocShell>
  );
}
