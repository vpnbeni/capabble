import type { Metadata } from "next";
import { DocShell } from "@/components/docs/DocShell";
import { PricingPage } from "@/components/pricing/PricingPage";
import { legalFacts } from "@/content/legalFacts";
import "@/components/pricing/pricing.css";

export const metadata: Metadata = {
  title: "Pricing | Capabble",
  description:
    "Every Capabble module for ₹60,000 a year, or only the modules your school needs. Free 14-day trial, prices in rupees, GST invoices.",
  alternates: { canonical: "/pricing" },
};

export default function Pricing() {
  return (
    <DocShell page="pricing">
      <PricingPage
        contact={{ email: legalFacts.supportEmail, phone: legalFacts.supportPhone, hours: legalFacts.supportHours }}
      />
    </DocShell>
  );
}
