"use client";

import { useSyncExternalStore } from "react";
import { getSchoolOsOrigin, SCHOOL_OS_ORIGIN } from "@/lib/schoolOs";

const noop = () => () => {};

/**
 * Sign in / Create account links to School OS. These pages are prerendered, so the
 * stage-vs-production origin is picked in the browser (the server snapshot is production).
 */
export function AccountNav() {
  const origin = useSyncExternalStore(
    noop,
    () => getSchoolOsOrigin(window.location.host),
    () => SCHOOL_OS_ORIGIN
  );
  return (
    <nav aria-label="Account" className="cb-doc-account">
      <a className="cb-doc-navlink" href={`${origin}/#/login`}>
        Sign in
      </a>
      <a className="cb-doc-navlink" data-outline="" href={`${origin}/#/signup`}>
        Create account
      </a>
    </nav>
  );
}
