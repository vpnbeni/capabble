// School OS (the tenant app) lives on its own origin; stage builds point at the stage app.
export const SCHOOL_OS_ORIGIN = "https://school.capabble.cloud";

export function getSchoolOsOrigin(host: string): string {
  if (host.startsWith("stage.")) return "https://stageschool.capabble.cloud";
  return SCHOOL_OS_ORIGIN;
}
