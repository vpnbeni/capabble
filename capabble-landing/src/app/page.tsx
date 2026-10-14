import { headers } from "next/headers";
import { CapabbleLanding } from "@/components/landing/CapabbleLanding";
import { caveat, inter } from "@/lib/fonts";
import { getSchoolOsOrigin } from "@/lib/schoolOs";

export default async function Home() {
  const headersList = await headers();
  const origin = getSchoolOsOrigin(headersList.get("host") || "");

  return (
    <div className={`${inter.variable} ${caveat.variable}`}>
      <CapabbleLanding loginUrl={`${origin}/#/login`} signupUrl={`${origin}/#/signup`} />
    </div>
  );
}
