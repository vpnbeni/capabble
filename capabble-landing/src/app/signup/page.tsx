import { headers } from "next/headers";
import { redirect } from "next/navigation";

function getSchoolOrigin(host: string): string {
  if (host.startsWith("stage.")) return "https://stageschool.capabble.cloud";
  return "https://school.capabble.cloud";
}

export default async function SignupPage() {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const schoolOrigin = getSchoolOrigin(host);
  redirect(`${schoolOrigin}/#/signup`);
}
