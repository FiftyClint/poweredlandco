#!/usr/bin/env node
import assert from 'node:assert/strict';
import worker from '../workers/site/index.mjs';
import { STATE_OPTIONS, SOURCE_SITE_OPTIONS } from '../workers/site/lead-to-notion.mjs';
import { allSites } from '../src/data/sites.node.mjs';

/**
 * Exercises the lead receiver without deploying it or touching Notion.
 *
 * A Worker's fetch handler is an ordinary function of (Request, env) to
 * Response, so the whole thing runs in Node with a stubbed Notion. That matters
 * because the alternative is finding out whether a submission saves by asking a
 * real landowner to fill in a real form, and being wrong about it is the exact
 * failure this code was written to prevent.
 *
 * The cases that earn their place here are the ones where being wrong is
 * expensive: a lead silently discarded, or a visitor thanked for a submission
 * that never arrived.
 */

const failures = [];
const check = (label, fn) => {
  try {
    fn();
    console.log(`  pass  ${label}`);
  } catch (error) {
    console.log(`  FAIL  ${label}`);
    console.log(`        ${error.message.split('\n')[0]}`);
    failures.push(label);
  }
};

/** Captures what the Worker would have sent to Notion. */
let sent = null;
let notionReply = () => new Response(JSON.stringify({ object: 'page' }), { status: 200 });

globalThis.fetch = async (url, init) => {
  sent = { url: String(url), init, body: JSON.parse(init.body) };
  return notionReply();
};

let assetsCalls = 0;
const env = {
  NOTION_TOKEN: 'secret_test_token',
  ASSETS: {
    fetch: async () => {
      assetsCalls += 1;
      return new Response('a built page', { status: 200 });
    },
  },
};

const post = (fields, options = {}) => {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) value.forEach((v) => body.append(key, v));
    else body.append(key, value);
  }
  return new Request('https://arkansasdatacenterland.com/api/lead', { method: 'POST', body });
};

const complete = {
  name: 'Test Landowner',
  phone: '620 555 0134',
  email: 'test@example.com',
  state: 'Arkansas',
  county: 'Reno',
  acres: 'not sure',
  electric_service: 'unsure',
  nearby: ['substation', 'power-lines'],
  decision_maker: 'shared',
  timeline: 'curious',
  notes: 'Big power lines cross the north side.',
  source_site: 'arkansasdatacenterland.com',
  website: '',
  form_loaded_at: String(Date.now() - 90_000),
  client: 'script',
};

const reset = () => {
  sent = null;
  notionReply = () => new Response(JSON.stringify({ object: 'page' }), { status: 200 });
};

console.log('Option lists still match the site data');

const liveStateNames = allSites()
  .filter((s) => s.type === 'state')
  .map((s) => s.stateName)
  .sort();

check('every state in the repo is a Notion option', () => {
  const missing = liveStateNames.filter((name) => !STATE_OPTIONS.includes(name));
  assert.deepEqual(
    missing,
    [],
    `states in src/data/sites but not in STATE_OPTIONS: ${missing.join(', ')}. ` +
      'Add them to workers/site/lead-to-notion.mjs AND to the State property in Notion.',
  );
});

check('every domain in the repo is a Notion option', () => {
  const missing = allSites()
    .map((s) => s.domain)
    .filter((domain) => !SOURCE_SITE_OPTIONS.includes(domain));
  assert.deepEqual(
    missing,
    [],
    `domains in src/data/sites but not in SOURCE_SITE_OPTIONS: ${missing.join(', ')}`,
  );
});

console.log('\nA complete submission');

reset();
const ok = await worker.fetch(post(complete), env);
const props = sent?.body?.properties ?? {};

check('the visitor is told it worked', () => assert.equal(ok.status, 200));
check('Notion was called once', () => assert.equal(sent.url, 'https://api.notion.com/v1/pages'));
check('the token is sent as a bearer credential', () =>
  assert.equal(sent.init.headers.authorization, 'Bearer secret_test_token'));
check('the API version is pinned', () =>
  assert.match(sent.init.headers['notion-version'], /^\d{4}-\d{2}-\d{2}$/));
check('it writes to the Landowner Leads database', () =>
  assert.equal(sent.body.parent.database_id, 'b892f146-ee8d-4e30-b56f-17b8f727f6b0'));

check('name becomes the row title', () =>
  assert.equal(props.Name.title[0].text.content, 'Test Landowner'));
check('phone is kept', () => assert.equal(props.Phone.phone_number, '620 555 0134'));
check('email is kept', () => assert.equal(props.Email.email, 'test@example.com'));
check('county is kept', () => assert.equal(props.County.rich_text[0].text.content, 'Reno'));
check('an unsure acreage survives as text', () =>
  assert.equal(props.Acres.rich_text[0].text.content, 'not sure'));
check('state maps to its option', () => assert.equal(props.State.select.name, 'Arkansas'));
check('source site maps to its option', () =>
  assert.equal(props['Source Site'].select.name, 'arkansasdatacenterland.com'));
check('unsure electric service maps to Not sure', () =>
  assert.equal(props['Electric Service'].select.name, 'Not sure'));
check('a shared decision maps correctly', () =>
  assert.equal(props['Decision Maker'].select.name, 'Shared decision'));
check('just curious maps correctly', () =>
  assert.equal(props.Timeline.select.name, 'Just curious'));
check('both nearby answers arrive', () =>
  assert.deepEqual(
    props.Nearby.multi_select.map((o) => o.name).sort(),
    ['Electric substation', 'Large power lines'],
  ));
check('notes are kept verbatim', () =>
  assert.equal(props.Notes.rich_text[0].text.content, 'Big power lines cross the north side.'));

/*
 * The "New leads" view shows rows whose Screening is empty. Setting it here
 * would file every new lead as already handled, which is a lead lost in the
 * only way that leaves no trace at all.
 */
check('Screening is never set, so the lead shows up in New leads', () =>
  assert.equal(props.Screening, undefined));

check('nothing is flagged as spam', () => assert.equal(props['Spam signal'], undefined));

console.log('\nWhen a submission cannot be saved, nobody is thanked');

reset();
notionReply = () =>
  new Response(JSON.stringify({ code: 'validation_error' }), { status: 400 });
const rejected = await worker.fetch(post(complete), env);
check('a Notion rejection is reported as a failure', () => assert.equal(rejected.status, 502));

reset();
globalThis.fetch = async () => {
  throw new Error('network down');
};
const unreachable = await worker.fetch(post(complete), env);
check('an unreachable Notion is reported as a failure', () =>
  assert.equal(unreachable.status, 502));

globalThis.fetch = async (url, init) => {
  sent = { url: String(url), init, body: JSON.parse(init.body) };
  return notionReply();
};

reset();
const noToken = await worker.fetch(post(complete), { ...env, NOTION_TOKEN: '' });
check('a Worker with no token refuses rather than pretending', () =>
  assert.equal(noToken.status, 503));
check('and does not call Notion at all', () => assert.equal(sent, null));

console.log('\nSpam checks flag, they never discard');

reset();
await worker.fetch(post({ ...complete, website: 'http://spam.example' }), env);
check('a filled honeypot is still saved', () => assert.ok(sent !== null));
check('and is flagged', () => assert.equal(sent.body.properties['Spam signal'].checkbox, true));
check('with the name intact so a real person is never lost', () =>
  assert.equal(sent.body.properties.Name.title[0].text.content, 'Test Landowner'));

reset();
await worker.fetch(post({ ...complete, form_loaded_at: String(Date.now()) }), env);
check('an impossibly fast submission is saved and flagged', () =>
  assert.equal(sent.body.properties['Spam signal'].checkbox, true));

reset();
await worker.fetch(post({ ...complete, form_loaded_at: String(Date.now() + 600_000) }), env);
check('a visitor whose clock runs fast is not flagged', () =>
  assert.equal(sent.body.properties['Spam signal'], undefined));

console.log('\nAn answer we do not recognise never costs us the lead');

reset();
await worker.fetch(
  post({
    ...complete,
    state: 'Nebraska',
    electric_service: 'maybe',
    nearby: ['airport'],
    source_site: 'somewhere-else.com',
    email: 'not-an-address',
  }),
  env,
);
const salvaged = sent.body.properties;

check('an unknown state is not sent as a select', () =>
  assert.equal(salvaged.State, undefined));
check('an unrecognised email is not sent as an email', () =>
  assert.equal(salvaged.Email, undefined));
check('and none of it is thrown away', () => {
  const notes = salvaged.Notes.rich_text.map((r) => r.text.content).join('');
  for (const fragment of ['Nebraska', 'maybe', 'airport', 'somewhere-else.com', 'not-an-address']) {
    assert.ok(notes.includes(fragment), `Notes should mention ${fragment}, got: ${notes}`);
  }
});
check('the phone number still arrives, which is the part that matters', () =>
  assert.equal(salvaged.Phone.phone_number, '620 555 0134'));

console.log('\nRouting and abuse');

reset();
const wrongMethod = await worker.fetch(
  new Request('https://arkansasdatacenterland.com/api/lead'),
  env,
);
check('GET is refused', () => assert.equal(wrongMethod.status, 405));

reset();
const empty = await worker.fetch(post({ notes: 'hello' }), env);
check('a submission with no way to reply is refused', () => assert.equal(empty.status, 400));
check('and never reaches Notion', () => assert.equal(sent, null));

reset();
const noScript = await worker.fetch(post({ ...complete, client: '' }), env);
check('without JavaScript the browser is redirected to a real page', () => {
  assert.equal(noScript.status, 303);
  assert.equal(noScript.headers.get('location'), '/thank-you');
});

reset();
const evil = await worker.fetch(
  post({ ...complete, client: '', redirect_to: 'https://evil.example/phish' }),
  env,
);
check('the redirect cannot be pointed off our own domain', () =>
  assert.equal(evil.headers.get('location'), '/thank-you'));

reset();
const protocolRelative = await worker.fetch(
  post({ ...complete, client: '', redirect_to: '//evil.example/phish' }),
  env,
);
check('including with a protocol relative address', () =>
  assert.equal(protocolRelative.headers.get('location'), '/thank-you'));

reset();
assetsCalls = 0;
const page = await worker.fetch(new Request('https://arkansasdatacenterland.com/faq'), env);
check('an ordinary page is served from the built files', () => {
  assert.equal(assetsCalls, 1);
  assert.equal(page.status, 200);
});
check('and never calls Notion', () => assert.equal(sent, null));

reset();
assetsCalls = 0;
const strayApi = await worker.fetch(
  new Request('https://arkansasdatacenterland.com/api/leed', { method: 'POST' }),
  env,
);
check('a typo in the form action fails loudly instead of looking fine', () => {
  assert.equal(strayApi.status, 404);
  assert.equal(assetsCalls, 0);
});

console.log('');
if (failures.length > 0) {
  console.error(`Lead receiver verification FAILED: ${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('Lead receiver verification passed.');
