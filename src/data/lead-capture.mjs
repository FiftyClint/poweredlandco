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
 * WHERE LEADS ARE GOING (decided, built at deploy time)
 * =====================================================
 *
 * Notion database "PoweredLandCo Landowner Leads", under Business Operations
 * Hub, is the destination. Its fields match this form exactly.
 *
 *   database    b892f146-ee8d-4e30-b56f-17b8f727f6b0
 *   data source e12b4776-22db-4dca-9390-cc0b0a58a620
 *
 * It is separate from the existing "Data Center Leads" database on purpose.
 * That one is a CGF pipeline with Electric Bill, Grant Opportunity and CGF
 * Representative fields, and states that do not overlap ours. Merging the two
 * would make both harder to use.
 *
 * At deploy a small server function will map a submission onto that schema and
 * also upsert a CRMX contact. The value mapping is not one to one, so it is
 * written down here rather than rediscovered later:
 *
 *   electric_service  yes | no | unsure   -> Yes | No | Not sure
 *   decision_maker    sole | shared | no  -> Sole decision maker |
 *                                            Shared decision |
 *                                            Not the decision maker
 *   timeline          ready | open | curious -> Ready now | Open to offers |
 *                                               Just curious
 *   nearby            power-lines   -> Large power lines
 *                     substation    -> Electric substation
 *                     gas-line      -> Gas line
 *                     interstate    -> Interstate or highway
 *                     water         -> River or water
 *                     none-unsure   -> None or not sure
 *
 * The function must not set Screening, so a submission can never overwrite a
 * decision already made about that lead. Note that leaving it out does not
 * leave it empty: Notion fills a status property with the first option in its
 * "to do" group, so every row arrives as "Not started". The "New leads" view
 * groups by Screening rather than filtering on it being empty.
 *
 * That function now exists. It is workers/site/index.mjs, it answers at
 * /api/lead on every site's own domain, and workers/site/lead-to-notion.mjs
 * holds the mapping above in executable form. Because it runs on the same
 * domain as the pages, the form posts to a relative path and the built HTML is
 * identical on all nineteen sites.
 *
 * The Notion token is a Cloudflare Worker secret, pushed by scripts/deploy.mjs
 * from the NOTION_TOKEN repository secret. It is never in the built files.
 */

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

/**
 * Where the form posts when nothing else is configured.
 *
 * A relative path on purpose. The receiver runs on each site's own domain, so
 * one built page is correct on all nineteen and there is no cross-origin
 * request to configure, break, or forget when a state goes live.
 */
export const LEAD_ENDPOINT = '/api/lead';

/**
 * Whether the built-in receiver will actually be there to answer.
 *
 * The Worker can only write to Notion if it has a token, and it only gets one
 * if NOTION_TOKEN is present at deploy time. Reading it here, at build time on
 * the build machine, is how the pages know whether a form would work.
 *
 * Only the presence of the value is ever read. The token itself is never
 * returned from this module and so can never end up in a built page.
 */
const receiverConfigured = () => (process.env?.NOTION_TOKEN ?? '').trim().length > 0;

export const leadWebhook = () =>
  fromEnv('PUBLIC_LEAD_WEBHOOK') ||
  LEAD_WEBHOOK.trim() ||
  (receiverConfigured() ? LEAD_ENDPOINT : '');

/** True when we are rendering our own form rather than the CRMX embed. */
export const usingFallbackForm = () => crmxEmbed().length === 0;

/**
 * Whether a submitted form actually reaches somewhere.
 *
 * This exists because of a real failure. With no CRMX embed and no webhook, the
 * form had no action, so the browser posted it back to the page itself, the
 * page returned 200, and the script reported "Thank you. We have your
 * information." to a landowner whose details had gone nowhere at all.
 *
 * Losing a lead is bad. Telling somebody you have their information when you do
 * not is worse, and it is the exact opposite of what every other word on these
 * sites promises. So a form with no destination is never rendered, and
 * scripts/check-lead-destination.mjs stops a site with no destination from
 * being deployed at all.
 */
export const hasLeadDestination = () => crmxEmbed().length > 0 || leadWebhook().length > 0;

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
