import { headers } from "next/headers";
import { Caveat, Inter } from "next/font/google";
import { CapabbleLanding } from "@/components/landing/CapabbleLanding";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-inter" });
const caveat = Caveat({ subsets: ["latin"], weight: ["600"], variable: "--font-caveat" });

// School OS (the tenant app) lives on its own origin; stage builds point at the stage app.
function getSchoolOsOrigin(host: string): string {
  if (host.startsWith("stage.")) return "https://stageschool.capabble.cloud";
  return "https://school.capabble.cloud";
}

export default async function Home() {
  const headersList = await headers();
  const origin = getSchoolOsOrigin(headersList.get("host") || "");

  return (
    <div className={`${inter.variable} ${caveat.variable}`}>
      <CapabbleLanding loginUrl={`${origin}/#/login`} signupUrl={`${origin}/#/signup`} />
    </div>
  );
}
