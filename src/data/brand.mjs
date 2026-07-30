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
