import type { Metadata } from "next";
import { LegalPage } from "@/components/docs/LegalPage";

export const metadata: Metadata = {
  title: "Privacy policy | Capabble",
  description: "What data Capabble collects, why, who it's shared with, how long it's kept, and your rights.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <LegalPage kind="privacy" />;
}
