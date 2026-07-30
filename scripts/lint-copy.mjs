#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { BANNED_TERMS, LEGAL_POSITIONING } from '../src/data/brand.mjs';
import { walk, visibleText, normalize } from './lib/html-text.mjs';
import { builtPages } from './lib/html-text.mjs';

/**
 * Copy rules, enforced rather than trusted.
 *
 * Three things are checked:
 *
 *  1. Banned vocabulary. We are principals, not a brokerage. Using any of these
 *     words risks implying an unlicensed brokerage relationship, which is the
 *     single largest legal exposure this network has.
 *
 *  2. Em dashes and exclamation points, which Clint does not want anywhere.
 *
 *  3. That the required positioning sentence appears verbatim on every page.
 *
 * Two sources are scanned. Rendered HTML is authoritative for anything that
 * actually ships. Source YAML and markdown are scanned too, so a violation in a
 * draft article or in a pending state file is caught before it is ever built.
 *
 * Rendered text is read from visible content only. Scripts, styles and JSON-LD
 * are excluded, since linting raw markup would flag `<!doctype`, `!important`
 * and "User-agent" forever.
 */

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = `${ROOT}dist`;

const problems = [];
const report = (file, detail) => problems.push({ file: relative(ROOT, file), detail });

const BANNED_RE = new RegExp(
  `\\b(${BANNED_TERMS.map((t) => t.replace(/\s+/g, '\\s+')).join('|')})\\b`,
  'gi',
);

// U+2014 em dash and U+2015 horizontal bar. En dashes are left alone: they show
// up legitimately in numeric ranges and are not what Clint objects to.
const EM_DASH_RE = /[—―]/g;
const BANG_RE = /!/g;

const excerpt = (text, index, span = 60) =>
  normalize(text.slice(Math.max(0, index - span), index + span));

/**
 * The required positioning sentence contains the word "brokerage", because its
 * whole job is to deny being one. It is mandated verbatim and is separately
 * asserted to be present, so it is removed before the banned-word scan rather
 * than flagged on every page of every site.
 *
 * This is the only text exempt from the vocabulary rule.
 */
const withoutPositioning = (text) => text.split(LEGAL_POSITIONING).join(' ');

function checkText(file, text, { allowBang = false } = {}) {
  const scannable = withoutPositioning(text);
  for (const match of scannable.matchAll(BANNED_RE)) {
    report(
      file,
      `banned word "${match[0]}" near: ...${excerpt(scannable, match.index)}...`,
    );
  }
  for (const match of text.matchAll(EM_DASH_RE)) {
    report(file, `em dash near: ...${excerpt(text, match.index)}...`);
  }
  if (!allowBang) {
    for (const match of text.matchAll(BANG_RE)) {
      report(file, `exclamation point near: ...${excerpt(text, match.index)}...`);
    }
  }
}

/** Walks a parsed YAML tree and checks only string leaves. */
function checkYamlStrings(file, node, path = '') {
  if (typeof node === 'string') {
    checkText(`${file}${path ? ` (${path})` : ''}`, node);
  } else if (Array.isArray(node)) {
    node.forEach((item, i) => checkYamlStrings(file, item, `${path}[${i}]`));
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      checkYamlStrings(file, value, path ? `${path}.${key}` : key);
    }
  }
}

// ---- Source: site data files -------------------------------------------------

for (const file of walk(`${ROOT}src/data/sites`, (f) => f.endsWith('.yaml'))) {
  checkYamlStrings(file, parseYaml(readFileSync(file, 'utf8')));
}

// ---- Source: articles, drafts included --------------------------------------

for (const file of walk(`${ROOT}src/content`, (f) => /\.mdx?$/.test(f))) {
  const raw = readFileSync(file, 'utf8');
  const body = raw
    .replace(/^---\n[\s\S]*?\n---\n/, '') // frontmatter is checked separately
    .replace(/```[\s\S]*?```/g, '') // fenced code
    .replace(/`[^`]*`/g, '') // inline code
    .replace(/\]\([^)]*\)/g, ']') // link targets, which may contain anything
    .replace(/^\s*\[[^\]]+\]:\s*\S+$/gm, ''); // reference definitions
  checkText(file, body);

  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1];
  if (frontmatter) {
    const data = parseYaml(frontmatter) ?? {};
    // Source URLs and labels are quoted from third parties and may legitimately
    // contain anything, so only our own prose fields are linted.
    for (const key of ['title', 'description']) {
      if (typeof data[key] === 'string') checkText(`${file} (${key})`, data[key]);
    }
  }
}

// ---- Built output ------------------------------------------------------------

if (!existsSync(DIST)) {
  console.error('No dist/ directory. Run `npm run build:all` before linting copy.');
  process.exit(1);
}

const pages = builtPages(DIST);
if (pages.length === 0) {
  console.error('dist/ contains no HTML. Run `npm run build:all` first.');
  process.exit(1);
}

for (const page of pages) {
  const text = visibleText(page.html);
  checkText(page.file, text);

  // The positioning sentence is legally load-bearing and must appear verbatim.
  if (!normalize(text).includes(normalize(LEGAL_POSITIONING))) {
    report(page.file, 'missing the required principal-not-broker sentence');
  }
}

// ---- Result ------------------------------------------------------------------

if (problems.length > 0) {
  console.error(`Copy check failed with ${problems.length} problem(s):\n`);
  for (const { file, detail } of problems) console.error(`  ${file}\n    ${detail}\n`);
  process.exit(1);
}

console.log(
  `Copy check passed. ${pages.length} built page(s) scanned, positioning sentence present on all of them.`,
);
