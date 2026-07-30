#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs';
import { relative } from 'node:path';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { serveDir } from './lib/serve.mjs';
import { walk } from './lib/html-text.mjs';
import { chromiumPath } from './lib/browser.mjs';

/**
 * Lighthouse on every built page, mobile profile.
 *
 * Mobile rather than desktop because that is how this audience arrives. The
 * threshold is 95 across performance, accessibility and SEO. Best practices is
 * reported but not gated, since it penalises things we do not control from a
 * local static server.
 */

const THRESHOLD = 95;
const GATED = ['performance', 'accessibility', 'seo'];

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = `${ROOT}dist`;

if (!existsSync(DIST)) {
  console.error('No dist/. Run `npm run build:all` first.');
  process.exit(1);
}

const only = process.argv.includes('--site')
  ? process.argv[process.argv.indexOf('--site') + 1]
  : null;

const sites = readdirSync(DIST).filter((s) => !only || s === only);

const chrome = await chromeLauncher.launch({
  chromePath: chromiumPath() ?? undefined,
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
});

const failures = [];
let audited = 0;

try {
  for (const site of sites) {
    const root = `${DIST}/${site}`;
    const server = await serveDir(root);

    const paths = walk(root, (f) => f.endsWith('.html'))
      // 404 is never reached through a normal navigation, so scoring it adds
      // noise without telling us anything about the pages people land on.
      // /thank-you is deliberately disallowed in robots.txt, which Lighthouse
      // scores as an SEO failure. It is a post-submission destination and is
      // not supposed to rank, so gating it would be gating a decision we made.
      .filter((f) => !f.endsWith('404.html') && !f.includes('thank-you'))
      .map((f) => '/' + relative(root, f).replace(/index\.html$/, '').replace(/\.html$/, ''));

    console.log(`\n${site}`);

    for (const path of paths) {
      const result = await lighthouse(
        `${server.origin}${path}`,
        { port: chrome.port, output: 'json', logLevel: 'error' },
        {
          extends: 'lighthouse:default',
          settings: { formFactor: 'mobile', screenEmulation: { mobile: true, disabled: false } },
        },
      );

      const scores = Object.fromEntries(
        Object.entries(result.lhr.categories).map(([key, cat]) => [
          key,
          Math.round((cat.score ?? 0) * 100),
        ]),
      );

      audited += 1;
      const bad = GATED.filter((key) => scores[key] < THRESHOLD);
      if (bad.length > 0) failures.push({ site, path, scores, bad });

      console.log(
        `  ${(path || '/').padEnd(28)} ` +
          `perf ${String(scores.performance).padStart(3)}  ` +
          `a11y ${String(scores.accessibility).padStart(3)}  ` +
          `seo ${String(scores.seo).padStart(3)}  ` +
          `bp ${String(scores['best-practices']).padStart(3)}  ` +
          `${bad.length ? 'FAIL' : 'ok'}`,
      );
    }

    await server.close();
  }
} finally {
  await chrome.kill();
}

console.log('');
if (failures.length > 0) {
  console.error(`Lighthouse FAILED on ${failures.length} of ${audited} page(s):\n`);
  for (const { site, path, scores, bad } of failures) {
    console.error(`  ${site}${path}`);
    for (const key of bad) console.error(`    ${key}: ${scores[key]} (needs ${THRESHOLD})`);
  }
  process.exit(1);
}

console.log(`Lighthouse passed. ${audited} page(s) at or above ${THRESHOLD} on ${GATED.join(', ')}.`);
