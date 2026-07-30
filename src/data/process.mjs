/**
 * Shared structure for the How It Works and What Makes Land Qualify pages.
 *
 * Only the short labels live here. The prose that goes with each one comes from
 * the site data file, per state.
 *
 * The reason is duplicate content. Four step descriptions repeated verbatim
 * across 18 domains is roughly 120 words of identical body copy per page, which
 * is exactly what scripts/check-duplicate-copy.mjs exists to catch and exactly
 * the risk that gets a site network deindexed. Short labels are safe because
 * they behave like navigation, and no 40-word window can be built from them.
 */

export const PROCESS_STEPS = [
  'You tell us about the land',
  'We check it against public records',
  'We call you if it looks workable',
  'We make an offer, or we tell you why not',
];

export const QUALIFY_CRITERIA = [
  'Electric power',
  'Acreage and shape',
  'Water',
  'Fiber and connectivity',
  'Road access',
];
