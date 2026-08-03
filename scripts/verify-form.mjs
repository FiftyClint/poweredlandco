#!/usr/bin/env node
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { serveDir } from './lib/serve.mjs';
import { launchOptions } from './lib/browser.mjs';

/**
 * End to end check of the fallback intake form.
 *
 * The form is the only thing on these sites that has to actually do something,
 * and it is the piece most likely to be quietly broken by a refactor. This
 * builds the hub against a throwaway webhook, drives a real browser through the
 * form, and asserts four things:
 *
 *   1. A submission reaches the webhook with the field names we expect.
 *   2. The visitor sees a confirmation without leaving the page.
 *   3. The honeypot is present and hidden from view.
 *   4. Only name, phone and email are required, so a landowner who does not
 *      know their acreage can still get through.
 */

const received = [];

const webhook = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    received.push(body);
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
    res.end('ok');
  });
});

await new Promise((resolve) => webhook.listen(0, '127.0.0.1', resolve));
const webhookUrl = `http://127.0.0.1:${webhook.address().port}/hook`;

console.log(`Building hub against test webhook ${webhookUrl}`);
const build = spawnSync('npx', ['astro', 'build'], {
  env: { ...process.env, SITE: 'hub', PUBLIC_LEAD_WEBHOOK: webhookUrl },
  encoding: 'utf8',
});
if (build.status !== 0) {
  console.error(build.stdout, build.stderr);
  process.exit(1);
}

const server = await serveDir(`${new URL('..', import.meta.url).pathname}dist/hub`);
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${label}${detail ? ` ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

await page.goto(`${server.origin}/`, { waitUntil: 'load' });

console.log('\nForm structure');

const honeypot = page.locator('input[name="website"]').first();
check('honeypot field exists', (await honeypot.count()) > 0);

/*
 * The honeypot is positioned off screen rather than hidden with display:none,
 * because some bots skip fields that are display:none and the point is that
 * they fill it in. Playwright reports an off-screen element as visible, so the
 * meaningful assertions are that it sits outside the viewport, that keyboard
 * users cannot tab into it, and that assistive technology ignores it.
 */
const box = await honeypot.boundingBox();
check(
  'honeypot sits off screen where nobody will see it',
  box !== null && (box.x + box.width < 0 || box.y + box.height < 0),
  `(x=${box?.x}, y=${box?.y})`,
);
check(
  'honeypot is skipped by keyboard and screen readers',
  (await honeypot.getAttribute('tabindex')) === '-1' &&
    (await page.locator('.lead-form__trap').first().getAttribute('aria-hidden')) === 'true',
);

const stamped = await page.locator('input[name="form_loaded_at"]').first().inputValue();
check('load time is stamped for the spam trap', /^\d{10,}$/.test(stamped), `(${stamped})`);

check(
  'no parcel number is ever requested',
  (await page.locator('input,select,textarea').evaluateAll((els) =>
    els.every((el) => !/parcel|apn|legal.?description/i.test(el.name || '')),
  )) === true,
);

const requiredNames = await page
  .locator('[required]')
  .evaluateAll((els) => els.map((el) => el.name).sort());
check(
  'only name, phone and email are required',
  JSON.stringify(requiredNames) === JSON.stringify(['email', 'name', 'phone']),
  `(${requiredNames.join(', ')})`,
);

const unsureCount = await page.getByText(/not sure/i).count();
check('an unsure answer is offered', unsureCount >= 3, `(${unsureCount} places)`);

console.log('\nSubmission');

await page.fill('input[name="name"]', 'Test Landowner');
await page.fill('input[name="phone"]', '620 555 0134');
await page.fill('input[name="email"]', 'test@example.com');
await page.fill('input[name="county"]', 'Reno');
await page.fill('input[name="acres"]', 'not sure');
await page.check('input[name="electric_service"][value="unsure"]');
await page.check('input[name="nearby"][value="substation"]');
await page.check('input[name="decision_maker"][value="shared"]');
await page.check('input[name="timeline"][value="curious"]');
await page.fill('textarea[name="notes"]', 'Big power lines cross the north side.');

await page.click('button[type="submit"]');
await page.waitForFunction(
  () => document.querySelector('[data-form-status]')?.hidden === false,
  { timeout: 10000 },
);

const status = await page.locator('[data-form-status]').innerText();
check('visitor sees a confirmation without leaving the page', /thank you/i.test(status));
check('webhook received the submission', received.length === 1, `(${received.length})`);

const payload = received[0] ?? '';
for (const field of [
  'name',
  'phone',
  'email',
  'county',
  'acres',
  'electric_service',
  'nearby',
  'decision_maker',
  'timeline',
  'notes',
  'source_site',
]) {
  check(`payload contains ${field}`, payload.includes(`name="${field}"`));
}

await browser.close();
await server.close();
webhook.close();

// ---- The case the first version of this script did not cover ----------------
//
// Everything above supplies a webhook, so it only ever tested the happy path.
// The default configuration has no destination at all, and in that state the
// form used to report success for a submission that went nowhere. That is the
// failure worth guarding hardest against, so it is tested explicitly.

console.log('\nNo destination configured');

const bare = spawnSync('npx', ['astro', 'build'], {
  env: {
    ...process.env,
    SITE: 'hub',
    PUBLIC_LEAD_WEBHOOK: '',
    PUBLIC_CRMX_EMBED: '',
    // Also unset, because a token in the environment turns on the built-in
    // receiver and this section is specifically about having no destination.
    NOTION_TOKEN: '',
  },
  encoding: 'utf8',
});
if (bare.status !== 0) {
  console.error(bare.stdout, bare.stderr);
  process.exit(1);
}

const bareServer = await serveDir(`${new URL('..', import.meta.url).pathname}dist/hub`);
const bareBrowser = await chromium.launch(launchOptions());
const barePage = await bareBrowser.newPage({ viewport: { width: 390, height: 844 } });
await barePage.goto(`${bareServer.origin}/`, { waitUntil: 'load' });

const formCount = await barePage.locator('form.lead-form').count();
check('no form is rendered when nothing would receive it', formCount === 0);
check(
  'an email address is offered instead',
  (await barePage.locator('.form-slot__email a[href^="mailto:"]').count()) > 0,
);
check(
  'no success message can appear, because there is nothing to submit',
  (await barePage.locator('[data-form-status]').count()) === 0,
);

await bareBrowser.close();
await bareServer.close();

// ---- The shape the sites are actually deployed in ---------------------------
//
// In production there is no PUBLIC_LEAD_WEBHOOK. The form posts to /api/lead on
// its own domain, answered by the Worker in workers/site/. That Worker is
// tested on its own in scripts/verify-lead-receiver.mjs. What is checked here
// is the join between the two, which is the part a refactor breaks silently.

console.log('\nProduction shape, posting to the built-in receiver');

const live = spawnSync('npx', ['astro', 'build'], {
  env: {
    ...process.env,
    SITE: 'hub',
    PUBLIC_LEAD_WEBHOOK: '',
    PUBLIC_CRMX_EMBED: '',
    NOTION_TOKEN: 'secret_test_token',
  },
  encoding: 'utf8',
});
if (live.status !== 0) {
  console.error(live.stdout, live.stderr);
  process.exit(1);
}

const liveServer = await serveDir(`${new URL('..', import.meta.url).pathname}dist/hub`);
const liveBrowser = await chromium.launch(launchOptions());
const livePage = await liveBrowser.newPage({ viewport: { width: 390, height: 844 } });

/*
 * The Worker is not running here, so the request is intercepted and answered
 * the way a successful save would be. That keeps this about the browser side of
 * the contract, without needing Cloudflare or Notion to run a test.
 */
let intercepted = null;
await livePage.route('**/api/lead', async (route) => {
  intercepted = { url: route.request().url(), body: route.request().postData() ?? '' };
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
});

await livePage.goto(`${liveServer.origin}/`, { waitUntil: 'load' });

const action = await livePage.locator('form.lead-form').first().getAttribute('action');
check('the form posts to the receiver on its own domain', action === '/api/lead', `(${action})`);

const fill = async () => {
  await livePage.fill('input[name="name"]', 'Test Landowner');
  await livePage.fill('input[name="phone"]', '620 555 0134');
  await livePage.fill('input[name="email"]', 'test@example.com');
  await livePage.click('button[type="submit"]');
  await livePage.waitForFunction(
    () => document.querySelector('[data-form-status]')?.hidden === false,
    { timeout: 10000 },
  );
};

await fill();

check('the submission actually reached /api/lead', intercepted !== null);
check(
  'it is marked as coming from the script, so the visitor stays on the page',
  (intercepted?.body ?? '').includes('client'),
);
check(
  'the visitor sees a confirmation only after the receiver answers',
  /thank you/i.test(await livePage.locator('[data-form-status]').innerText()),
);

/*
 * The whole point of the rewrite. If the receiver cannot save the lead, the
 * visitor has to be told, not thanked.
 */
await livePage.unroute('**/api/lead');
await livePage.route('**/api/lead', (route) =>
  route.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"no"}' }),
);
await livePage.reload({ waitUntil: 'load' });
await fill();

const failedStatus = await livePage.locator('[data-form-status]').innerText();
check('a failed save is never reported as a thank you', !/thank you/i.test(failedStatus));
check('the visitor is told plainly it did not go through', /did not go through/i.test(failedStatus));
check(
  'and the button comes back so they can try again',
  (await livePage.locator('button[type="submit"]').count()) === 1,
);

await liveBrowser.close();
await liveServer.close();

console.log('');
if (failures.length > 0) {
  console.error(`Form verification FAILED: ${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('Form verification passed.');
