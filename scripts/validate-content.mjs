#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { allSites } from '../src/data/sites.node.mjs';
import { walk } from './lib/html-text.mjs';

/**
 * Blocks unsourced factual claims from being published.
 *
 * The rule for this content engine is that any claim about incentives,
 * utilities, regulation or market activity carries a source, or gets rewritten
 * as general guidance. A model writing these articles will produce
 * confident-sounding numbers if left alone, and a landowner making a decision
 * about their property deserves better than that. So the check lives here,
 * outside the writing step, where it cannot be talked out of failing.
 *
 * Published articles fail the build. Drafts only warn, because a draft is a
 * work in progress and is never served to anyone.
 */

const ROOT = new URL('..', import.meta.url).pathname;

/** Patterns that read as a specific factual assertion rather than guidance. */
const CLAIM_PATTERNS = [
  { label: 'dollar amount', re: /\$\s?[\d,]+(\.\d+)?\s*(million|billion|thousand|k|m|b)?/gi },
  { label: 'percentage', re: /\b\d+(\.\d+)?\s?(%|percent)\b/gi },
  { label: 'power figure', re: /\b\d[\d,.]*\s?(mw|gw|kv|megawatt|gigawatt|kilovolt)s?\b/gi },
  { label: 'acreage figure', re: /\b\d{2,}[\d,]*\s?acres\b/gi },
  {
    label: 'named program or statute',
    re: /\b(?:[A-Z][A-Za-z]+\s){1,5}(?:Act|Credit|Exemption|Abatement|Incentive|Program|Statute|Code)\b/g,
  },
  {
    // Targeted at genuine superlative claims. Matching a bare "most" would fire
    // on ordinary sentences like "most land does not qualify", and a validator
    // that cries wolf is a validator people learn to ignore.
    label: 'ranking claim',
    re: /\b(?:the|world'?s|nation'?s|country'?s|state'?s)\s+(?:largest|biggest|leading|fastest[-\s]growing|number one|top)\b/gi,
  },
];

const knownSiteKeys = new Set(allSites().map((s) => s.key));
const errors = [];
const warnings = [];

const files = walk(`${ROOT}src/content/articles`, (f) => /\.mdx?$/.test(f));

for (const file of files) {
  const rel = relative(ROOT, file);
  const raw = readFileSync(file, 'utf8');

  const fmMatch = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!fmMatch) {
    errors.push(`${rel}: no frontmatter block`);
    continue;
  }

  let data;
  try {
    data = parseYaml(fmMatch[1]) ?? {};
  } catch (error) {
    errors.push(`${rel}: frontmatter is not valid YAML (${error.message})`);
    continue;
  }

  const body = fmMatch[2]
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/\]\([^)]*\)/g, ']');

  const published = data.status === 'published';
  const target = published ? errors : warnings;

  if (!knownSiteKeys.has(data.state)) {
    errors.push(
      `${rel}: state "${data.state}" is not a known site key (${[...knownSiteKeys].join(', ')})`,
    );
  }

  if (published && !data.published) {
    errors.push(`${rel}: status is published but no publication date is set`);
  }

  const sources = Array.isArray(data.sources) ? data.sources : [];

  // Collect the claims, deduplicated, so the message is readable.
  const claims = new Map();
  for (const { label, re } of CLAIM_PATTERNS) {
    for (const match of body.matchAll(re)) {
      const text = match[0].trim();
      if (!claims.has(text)) claims.set(text, label);
    }
  }

  if (claims.size > 0 && sources.length === 0) {
    const listed = [...claims.entries()]
      .slice(0, 8)
      .map(([text, label]) => `      "${text}" (${label})`)
      .join('\n');
    target.push(
      `${rel}: ${claims.size} factual claim(s) with no sources in frontmatter:\n${listed}` +
        (claims.size > 8 ? `\n      ...and ${claims.size - 8} more` : '') +
        '\n    Add a source for each, or rewrite them as general guidance.',
    );
  } else if (claims.size > 0) {
    console.log(
      `  ${rel}: ${claims.size} claim(s), ${sources.length} source(s) listed. ` +
        'Confirm each claim traces to one of them.',
    );
  }
}

if (warnings.length > 0) {
  console.warn(`\n${warnings.length} warning(s) in drafts:\n`);
  for (const warning of warnings) console.warn(`  ${warning}\n`);
}

if (errors.length > 0) {
  console.error(`\nContent validation FAILED with ${errors.length} error(s):\n`);
  for (const error of errors) console.error(`  ${error}\n`);
  process.exit(1);
}

console.log(
  `Content validation passed. ${files.length} article file(s) checked` +
    (warnings.length ? `, ${warnings.length} draft warning(s).` : '.'),
);
