#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs';
import { relative } from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { ACCENTS } from '../src/data/brand.mjs';
import { serveDir } from './lib/serve.mjs';
import { walk } from './lib/html-text.mjs';
import { launchOptions } from './lib/browser.mjs';

/**
 * Accessibility audit. Two parts, both of which fail the run.
 *
 * 1. Contrast of the design tokens, computed rather than eyeballed. Every
 *    sanctioned accent has to clear WCAG AA both as text on the page background
 *    and as white text on a filled button, or it cannot be given to a state.
 *
 * 2. axe-core against every built page at a phone viewport, which is how most
 *    of this audience will actually see these sites.
 */

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = `${ROOT}dist`;

const BG = '#FAF8F3';
const INK = '#1F1D1A';
const WHITE = '#FFFFFF';
const AA = 4.5;

const luminance = (hex) => {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

let failed = false;

// ---- Part 1: design token contrast ------------------------------------------

console.log('Contrast (WCAG AA needs 4.5:1 for normal text)\n');
console.log(`  ink on background          ${contrast(INK, BG).toFixed(2)}:1`);

for (const [name, tone] of Object.entries(ACCENTS)) {
  const onBg = contrast(tone.base, BG);
  const whiteOn = contrast(WHITE, tone.base);
  const darkOnBg = contrast(tone.dark, BG);
  const ok = onBg >= AA && whiteOn >= AA && darkOnBg >= AA;
  if (!ok) failed = true;

  console.log(
    `  ${name.padEnd(8)} ${tone.base}  text ${onBg.toFixed(2)}:1  ` +
      `white-on-fill ${whiteOn.toFixed(2)}:1  link ${darkOnBg.toFixed(2)}:1  ${ok ? 'pass' : 'FAIL'}`,
  );
}

// ---- Part 2: axe-core --------------------------------------------------------

if (!existsSync(DIST)) {
  console.error('\nNo dist/. Run `npm run build:all` first.');
  process.exit(1);
}

const sites = readdirSync(DIST);
const browser = await chromium.launch(launchOptions());
let violationCount = 0;
let pageCount = 0;

console.log('\naxe-core, 390x844 viewport\n');

for (const site of sites) {
  const root = `${DIST}/${site}`;
  const server = await serveDir(root);
  const paths = walk(root, (f) => f.endsWith('.html')).map((f) =>
    '/' + relative(root, f).replace(/index\.html$/, '').replace(/\.html$/, ''),
  );

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  for (const path of paths) {
    await page.goto(`${server.origin}${path}`, { waitUntil: 'load' });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    pageCount += 1;

    if (results.violations.length > 0) {
      failed = true;
      violationCount += results.violations.length;
      console.log(`  ${site}${path}  ${results.violations.length} violation(s)`);
      for (const violation of results.violations) {
        console.log(`    [${violation.impact}] ${violation.id}: ${violation.help}`);
        for (const node of violation.nodes.slice(0, 3)) {
          console.log(`      ${node.target.join(' ')}`);
        }
      }
    }
  }

  await context.close();
  await server.close();
}

await browser.close();

console.log('');
if (failed) {
  console.error(
    `Accessibility audit FAILED. ${violationCount} violation(s) across ${pageCount} page(s).`,
  );
  process.exit(1);
}
console.log(`Accessibility audit passed. ${pageCount} page(s), no violations.`);
