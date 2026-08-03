/**
 * Turns a form submission into the body of a Notion "create page" request.
 *
 * Kept as a pure function with no Worker APIs in it so the whole mapping can be
 * tested in plain Node without deploying anything or touching the real
 * database. scripts/verify-lead-receiver.mjs does exactly that.
 *
 * The governing rule here is that a lead is never lost to a validation error.
 * Notion rejects the entire page if a select value is not already an option on
 * the property, so an unrecognised answer would throw away the whole
 * submission, including the name and phone number, which are the parts that
 * matter. So anything this file cannot map confidently is dropped from its own
 * property and written into Notes as plain text instead. A slightly untidy row
 * beats a landowner who filled in the form and never heard from anybody.
 */

/*
 * These lists have to match the Notion property options character for
 * character. They are duplicated here rather than imported because a Worker
 * cannot read the repo at runtime. scripts/verify-lead-receiver.mjs asserts
 * that the state and domain lists still match src/data/sites/*.yaml, so adding
 * a nineteenth state without updating this file fails the build rather than
 * silently sending leads into Notes.
 */

export const STATE_OPTIONS = [
  'Arkansas',
  'Georgia',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Mississippi',
  'Missouri',
  'New York',
  'Ohio',
  'Oklahoma',
  'Pennsylvania',
  'Tennessee',
  'Texas',
  'Virginia',
  'Wisconsin',
  'Another state',
];

export const SOURCE_SITE_OPTIONS = [
  'poweredlandco.com',
  'arkansasdatacenterland.com',
  'georgiadatacenterland.com',
  'illinoisdatacenterland.com',
  'indianadatacenterland.com',
  'iowadatacenterland.com',
  'kansasdatacenterland.com',
  'kentuckydatacenterland.com',
  'louisianadatacenterland.com',
  'mississippidatacenterland.com',
  'missouridatacenterland.com',
  'newyorkdatacenterland.com',
  'ohiodatacenterland.com',
  'oklahomadatacenterland.com',
  'pennsylvaniadatacenterland.com',
  'tennesseedatacenterland.com',
  'texasdatacenterland.com',
  'virginiadatacenterland.com',
  'wisconsindatacenterland.com',
];

/* Form value to Notion option. Documented in src/data/lead-capture.mjs too. */

const ELECTRIC = { yes: 'Yes', no: 'No', unsure: 'Not sure' };

const DECISION = {
  sole: 'Sole decision maker',
  shared: 'Shared decision',
  no: 'Not the decision maker',
};

const TIMELINE = {
  ready: 'Ready now',
  open: 'Open to offers',
  curious: 'Just curious',
};

const NEARBY = {
  'power-lines': 'Large power lines',
  substation: 'Electric substation',
  'gas-line': 'Gas line',
  interstate: 'Interstate or highway',
  water: 'River or water',
  'none-unsure': 'None or not sure',
};

/* Notion caps a single rich text object at 2000 characters. */
const CHUNK = 2000;

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/** Splits long text into the chunks Notion will accept. */
const richText = (text) => {
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK) {
    chunks.push({ type: 'text', text: { content: text.slice(i, i + CHUNK) } });
  }
  return chunks;
};

/**
 * The narrowest useful test for an email address.
 *
 * Notion's email property is strict enough that a typo like "name@" can reject
 * the page. Anything that does not look like an address goes to Notes so we
 * still get the lead and can see what they meant to type.
 */
const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * @param {Record<string, string|string[]>} fields  form values, already parsed
 * @param {{ spam?: boolean }} [options]
 * @returns {{ properties: object, notes: string, unmapped: string[] }}
 */
export function buildLeadProperties(fields, options = {}) {
  const get = (key) => clean(Array.isArray(fields[key]) ? fields[key][0] : fields[key]);
  const getAll = (key) => {
    const value = fields[key];
    if (Array.isArray(value)) return value.map(clean).filter(Boolean);
    const single = clean(value);
    return single ? [single] : [];
  };

  /** Answers we could not put in their own column, written into Notes instead. */
  const unmapped = [];

  const properties = {};

  const name = get('name');
  properties.Name = { title: name ? richText(name) : [] };

  const phone = get('phone');
  if (phone) properties.Phone = { phone_number: phone.slice(0, CHUNK) };

  const email = get('email');
  if (email && looksLikeEmail(email)) {
    properties.Email = { email };
  } else if (email) {
    unmapped.push(`Email as typed: ${email}`);
  }

  const county = get('county');
  if (county) properties.County = { rich_text: richText(county) };

  const acres = get('acres');
  if (acres) properties.Acres = { rich_text: richText(acres) };

  /*
   * The hub's state dropdown sends "other" for anything outside the network,
   * which is the one form value that is deliberately not a state name.
   */
  const rawState = get('state');
  const state = rawState === 'other' ? 'Another state' : rawState;
  if (state) {
    if (STATE_OPTIONS.includes(state)) properties.State = { select: { name: state } };
    else unmapped.push(`State given: ${state}`);
  }

  const source = get('source_site');
  if (source) {
    if (SOURCE_SITE_OPTIONS.includes(source)) {
      properties['Source Site'] = { select: { name: source } };
    } else {
      unmapped.push(`Submitted from: ${source}`);
    }
  }

  const electric = get('electric_service');
  if (electric) {
    if (ELECTRIC[electric]) properties['Electric Service'] = { select: { name: ELECTRIC[electric] } };
    else unmapped.push(`Electric service answer: ${electric}`);
  }

  const decision = get('decision_maker');
  if (decision) {
    if (DECISION[decision]) properties['Decision Maker'] = { select: { name: DECISION[decision] } };
    else unmapped.push(`Decision maker answer: ${decision}`);
  }

  const timeline = get('timeline');
  if (timeline) {
    if (TIMELINE[timeline]) properties.Timeline = { select: { name: TIMELINE[timeline] } };
    else unmapped.push(`Timeline answer: ${timeline}`);
  }

  const nearby = getAll('nearby');
  const nearbyMapped = [];
  for (const value of nearby) {
    if (NEARBY[value]) nearbyMapped.push({ name: NEARBY[value] });
    else unmapped.push(`Nearby answer: ${value}`);
  }
  if (nearbyMapped.length > 0) properties.Nearby = { multi_select: nearbyMapped };

  if (options.spam) properties['Spam signal'] = { checkbox: true };

  const notes = [get('notes'), ...unmapped].filter(Boolean).join('\n\n');
  if (notes) properties.Notes = { rich_text: richText(notes) };

  /*
   * Screening is deliberately never set, so a submission can never overwrite a
   * decision somebody has already made about that lead.
   *
   * Worth knowing, because the first version of this got it wrong: leaving it
   * out does not produce an empty Screening. Notion fills a status property
   * with the first option in its "to do" group, so every new row arrives as
   * "Not started" whatever we send. The New leads view therefore groups by
   * Screening rather than filtering on it being empty, which is a filter that
   * matches nothing and silently hides every lead.
   */

  return { properties, notes, unmapped };
}

/** The full request body for POST https://api.notion.com/v1/pages */
export function buildNotionPage(fields, databaseId, options = {}) {
  const { properties } = buildLeadProperties(fields, options);
  return { parent: { database_id: databaseId }, properties };
}
