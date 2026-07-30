/**
 * Brand-level constants shared by every site in the network.
 *
 * Anything in here appears identically on all 19 domains. That is deliberate:
 * it is chrome and legal language, not body copy, so it is exempt from the
 * duplicate-copy checker. Anything that varies by state belongs in a site data
 * file, never here.
 */

export const BRAND = {
  name: 'PoweredLandCo',
  hubDomain: 'poweredlandco.com',

  // Clint is creating this address. Changing it here changes it on all 19 sites.
  email: 'info@poweredlandco.com',

  // No phone number is published. Clint chose email-only contact.
  phone: null,
};

/**
 * Required verbatim on every footer and every About page. The wording is
 * legally load-bearing and is asserted by scripts/lint-copy.mjs. Do not edit
 * without Clint's sign-off.
 */
export const LEGAL_POSITIONING =
  'PoweredLandCo is a principal buyer and site developer. We are not a licensed real estate brokerage and we do not represent sellers.';

/**
 * Consent language shown directly above the submit button and repeated in the
 * privacy policy.
 *
 * This exists because the form collects a phone number and we intend to call
 * and text people who fill it in. Federal rules on contacting consumers by
 * phone and text expect the disclosure to be clear, visible at the point of
 * submission, and paired with an easy way to stop. The last sentence is the
 * standard wording that consent is not a condition of anything, which matters
 * because we are asking people to hand over a phone number before they have
 * agreed to anything at all.
 */
export const CONTACT_CONSENT =
  'By sending this, you agree that we may contact you by phone, text message, or email about your property. Message and data rates may apply. You can tell us to stop at any time and we will. Agreeing is not a condition of any sale or purchase.';

/**
 * Jurisdiction for the governing law clause in the terms.
 *
 * Left null on purpose. Naming the wrong state is worse than naming none, and
 * this should be the state PoweredLandCo is actually organized in. Set it and
 * the clause appears; leave it and the clause stays out.
 */
export const LEGAL_JURISDICTION = null;

/**
 * Words that must never appear in site copy. We are principals, and using any
 * of these risks implying an unlicensed brokerage relationship.
 */
export const BANNED_TERMS = [
  'broker',
  'brokerage',
  'realty',
  'realtor',
  'agent',
  'listing',
  'list your property',
  'market your property',
];

/**
 * Sanctioned accent tones. Each state site may pick one; nothing else about the
 * design varies between sites. Every tone is verified to meet WCAG AA against
 * both the page background and white button text by scripts/audit-a11y.mjs.
 */
export const ACCENTS = {
  forest: { base: '#2F5B45', dark: '#234636', tint: '#E8EFEA' },
  pine: { base: '#1F5148', dark: '#173D36', tint: '#E5EEEC' },
  olive: { base: '#4C5A2E', dark: '#3A4523', tint: '#ECEFE3' },
  loam: { base: '#6B4423', dark: '#52341B', tint: '#F2EAE2' },
  slate: { base: '#2C4A5E', dark: '#213847', tint: '#E6ECF0' },
};

export const ACCENT_NAMES = Object.keys(ACCENTS);
