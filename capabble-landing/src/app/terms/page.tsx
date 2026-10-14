import type { Metadata } from "next";
import { LegalPage } from "@/components/docs/LegalPage";

export const metadata: Metadata = {
  title: "Terms of use | Capabble",
  description: "The agreement an institution accepts when it creates a Capabble workspace account.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <LegalPage kind="terms" />;
}
