/*
 * Business facts used on the Help, Privacy and Terms pages.
 *
 * Replace a value here and it updates everywhere it is used. A production build fails while any
 * "[…]" placeholder is still rendered (scripts/check-placeholders.mjs).
 *
 * Placeholders that appear only once, inside the legal text itself (retention
 * periods, sub-processors, governing-law city and so on), are filled directly
 * in privacy-policy.md and terms-of-use.md.
 */
export const legalFacts = {
  legalEntityName: 'Capabble Platforms LLP',
  registeredAddress: 'HN. 41, Village Godhri, PO Achhej, Tehsil Beri, Distt. Jhajjar, PIN 124106, Haryana, India',
  officeAddress: 'Unit 115 D, First Floor, Block A, Sector 34, Rohtak, Haryana 124001',
  infoEmail: 'info@capabble.cloud',
  supportEmail: 'support@capabble.cloud',
  supportPhone: '+91 90532 32597',
  supportHours: 'Mon–Sat, 10:00 am – 7:00 pm IST',
  legalContactEmail: 'support@capabble.cloud',
  privacyLastUpdated: '13 October 2026',
  termsLastUpdated: '13 October 2026',
}

/** Placeholder text in the markdown → the fact that replaces it. */
export const sharedPlaceholders: Record<string, string> = {
  '[Capabble legal entity name]': legalFacts.legalEntityName,
  '[registered address]': legalFacts.registeredAddress,
  '[support email]': legalFacts.supportEmail,
  '[legal contact email]': legalFacts.legalContactEmail,
}
