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

console.log('');
if (failures.length > 0) {
  console.error(`Form verification FAILED: ${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('Form verification passed.');
