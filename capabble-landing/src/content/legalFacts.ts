/*
 * Business facts used on the Help, Privacy and Terms pages.
 *
 * Each value is still the bracketed placeholder from the draft. Replace a value
 * here and it updates everywhere it is used. A production build fails while any
 * "[…]" placeholder is still rendered (scripts/check-placeholders.mjs).
 *
 * Placeholders that appear only once, inside the legal text itself (retention
 * periods, sub-processors, governing-law city and so on), are filled directly
 * in privacy-policy.md and terms-of-use.md.
 */
export const legalFacts = {
  legalEntityName: '[Capabble legal entity name]',
  registeredAddress: '[registered address]',
  supportEmail: '[support email]',
  supportPhone: '[support phone]',
  supportHours: '[Support hours, e.g. Mon–Sat, 9:00 am – 6:00 pm]',
  legalContactEmail: '[legal contact email]',
  privacyLastUpdated: '[date]',
  termsLastUpdated: '[date]',
}

/** Placeholder text in the markdown → the fact that replaces it. */
export const sharedPlaceholders: Record<string, string> = {
  '[Capabble legal entity name]': legalFacts.legalEntityName,
  '[registered address]': legalFacts.registeredAddress,
  '[support email]': legalFacts.supportEmail,
  '[legal contact email]': legalFacts.legalContactEmail,
}
