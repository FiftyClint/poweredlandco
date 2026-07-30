/*
 * WHERE LEADS GO
 * ==============
 *
 * Clint: these are the only two values you ever need to change here, and
 * changing one changes every site in the network at once.
 *
 * 1. CRMX_EMBED
 *    Once the intake form exists in CRMX, open the form, click Integrate or
 *    Embed, copy the whole block of code it gives you, and paste it between
 *    the backticks below, replacing the word EMPTY.
 *
 * 2. LEAD_WEBHOOK
 *    The Make.com webhook address. Paste it between the quotes below.
 *
 * Until CRMX_EMBED is filled in, every site shows our own built-in form
 * instead. That form works right now. It is not a placeholder.
 */

const CRMX_EMBED = ``;

const LEAD_WEBHOOK = ``;

/*
 * Below this line is wiring. Nothing here needs to be edited.
 * Environment variables win over the values above so a preview deployment can
 * point at a test destination without editing the repo.
 */

const fromEnv = (key) => {
  const value = import.meta.env?.[key] ?? process.env?.[key] ?? '';
  return typeof value === 'string' ? value.trim() : '';
};

export const crmxEmbed = () => fromEnv('PUBLIC_CRMX_EMBED') || CRMX_EMBED.trim();

export const leadWebhook = () => fromEnv('PUBLIC_LEAD_WEBHOOK') || LEAD_WEBHOOK.trim();

/** True when we are rendering our own form rather than the CRMX embed. */
export const usingFallbackForm = () => crmxEmbed().length === 0;

/**
 * Form options. These live here rather than in the component so the wording of
 * a choice can be adjusted without touching markup.
 *
 * Every question that could possibly be uncertain offers an "unsure" style
 * answer. A landowner must never be blocked by a question they cannot answer,
 * and we never ask for a parcel number or any other technical identifier.
 */
export const ACRE_HINT = 'A rough number is fine. If you are not sure, write not sure.';

export const ELECTRIC_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Not sure' },
];

export const NEARBY_OPTIONS = [
  { value: 'power-lines', label: 'Large power lines' },
  { value: 'substation', label: 'An electric substation' },
  { value: 'gas-line', label: 'A gas line' },
  { value: 'interstate', label: 'An interstate or highway' },
  { value: 'water', label: 'A river, creek, or other water' },
  { value: 'none-unsure', label: 'None of these, or not sure' },
];

export const DECISION_OPTIONS = [
  { value: 'sole', label: 'Yes, it is my decision' },
  { value: 'shared', label: 'I share the decision with family or partners' },
  { value: 'no', label: 'No' },
];

export const TIMELINE_OPTIONS = [
  { value: 'ready', label: 'Ready now' },
  { value: 'open', label: 'Open to offers' },
  { value: 'curious', label: 'Just curious what it is worth' },
];
