#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import { builtPages, visibleText } from './lib/html-text.mjs';

/**
 * Fails the build when two sites share a run of body copy.
 *
 * Duplicate content is the thing most likely to kill this network. Nineteen
 * domains built from one codebase will get discounted or dropped from the index
 * if their main content reads as the same document with the state name swapped.
 * Shared layout is fine. Shared sentences are not.
 *
 * Method: take the visible text of each page's <main>, normalise it to a word
 * list, and hash every rolling window of WINDOW words. If the same window
 * appears on two different sites, that is a collision and the build fails.
 *
 * Rolling windows rather than whole paragraphs on purpose. Hashing paragraphs
 * only catches copy that was duplicated wholesale; a shared run buried inside
 * two otherwise different paragraphs slips straight through, and that is the
 * common case when copy gets loosely rewritten per state.
 *
 * Two things are excluded, both deliberately:
 *
 *   - Anything outside <main>. Header, navigation and footer are chrome and are
 *     supposed to be identical.
 *   - Subtrees marked data-boilerplate, which is the intake form. It is the
 *     same form on every site, so it has the same field labels on every site.
 *     That attribute is for interface only, never for prose.
 *
 * Legal pages are allowlisted. Identical privacy and terms text across a
 * network is expected, carries little ranking risk, and rewriting legal
 * boilerplate per state to satisfy a checker would be a bad trade.
 */

const WINDOW = 40;

const ALLOWLIST = [
  /^\/privacy(\/|$)/,
  /^\/terms(\/|$)/,
  /^\/about(\/|$)/,
  /^\/404\.html$/,
  /^\/thank-you(\/|$)/,
];

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = `${ROOT}dist`;

if (!existsSync(DIST)) {
  console.error('No dist/ directory. Run `npm run build:all` before this check.');
  process.exit(1);
}

const pages = builtPages(DIST).filter((page) => !ALLOWLIST.some((re) => re.test(page.path)));

const sitesSeen = new Set(pages.map((p) => p.site));
if (sitesSeen.size < 2) {
  console.log(
    `Duplicate copy check skipped: only ${sitesSeen.size} site built (${[...sitesSeen].join(', ')}). ` +
      'This check compares sites against each other, so it needs at least two.',
  );
  process.exit(0);
}

/** Lowercase word list with punctuation removed, so rewording is what counts. */
const words = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

const seen = new Map(); // window hash -> { site, path, phrase }
const collisions = [];

for (const page of pages) {
  const text = visibleText(page.html, { onlyMain: true, exclude: '[data-boilerplate]' });
  const list = words(text);
  if (list.length < WINDOW) continue;

  // One report per page pair is enough. Twenty overlapping windows describing
  // the same duplicated paragraph is noise, not information.
  const reported = new Set();

  for (let i = 0; i + WINDOW <= list.length; i += 1) {
    const phrase = list.slice(i, i + WINDOW).join(' ');
    const hash = createHash('sha1').update(phrase).digest('hex');
    const previous = seen.get(hash);

    if (!previous) {
      seen.set(hash, { site: page.site, path: page.path, phrase });
      continue;
    }

    if (previous.site === page.site) continue; // same site, not our concern

    const pair = `${previous.site}:${previous.path}|${page.site}:${page.path}`;
    if (reported.has(pair)) continue;
    reported.add(pair);

    collisions.push({
      a: `${previous.site}${previous.path}`,
      b: `${page.site}${page.path}`,
      phrase,
    });
  }
}

if (collisions.length > 0) {
  console.error(
    `Duplicate copy check FAILED. ${collisions.length} shared passage(s) of ` +
      `${WINDOW} or more words found across different sites.\n`,
  );
  for (const { a, b, phrase } of collisions) {
    console.error(`  ${a}`);
    console.error(`  ${b}`);
    console.error(`    "${phrase}"\n`);
  }
  console.error(
    'Fix by writing different copy for each site, normally by moving the text\n' +
      'into the per-site data file. Do not mark prose as data-boilerplate to\n' +
      'silence this check.',
  );
  process.exit(1);
}

console.log(
  `Duplicate copy check passed. ${pages.length} page(s) across ${sitesSeen.size} sites, ` +
    `no shared ${WINDOW}-word passage.`,
);
