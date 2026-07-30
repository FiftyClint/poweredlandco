#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getSite, allSites } from '../src/data/sites.node.mjs';

/**
 * Scaffolds a new article draft.
 *
 *   npm run generate-article -- --state ar --topic "How to sell your land for a data center in Arkansas"
 *
 * What this does: creates a correctly structured draft with valid frontmatter,
 * the right state, a slug, and an outline shaped for a landowner audience.
 *
 * What this does not do: write the article. That is deliberate. A generator
 * that produced finished prose would be producing exactly the confident,
 * unsourced, invented-number writing this project cannot publish. The prose gets
 * written by a person or by Claude in a session where sources can actually be
 * looked up, and then it has to survive scripts/validate-content.mjs before it
 * can be published.
 *
 * Drafts are never published automatically. Publishing means changing status to
 * "published", which happens only after Clint has reviewed the rendered page.
 */

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1];
};

const stateKey = flag('state')?.toLowerCase();
const topic = flag('topic');

if (!stateKey || !topic) {
  console.error(
    'Usage: npm run generate-article -- --state <key> --topic "Article title"\n\n' +
      `Known state keys: ${allSites().map((s) => s.key).join(', ')}`,
  );
  process.exit(1);
}

let site;
try {
  site = getSite(stateKey);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (site.type === 'parked') {
  console.error(
    `"${stateKey}" is a parked site with a single placeholder page and no articles section. ` +
      'Give it a full site first.',
  );
  process.exit(1);
}

const slug = topic
  .toLowerCase()
  .replace(/[^\w\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-')
  .slice(0, 80);

const ROOT = new URL('..', import.meta.url).pathname;
const path = join(ROOT, 'src/content/articles', stateKey, `${slug}.md`);

if (existsSync(path)) {
  console.error(`Already exists: ${path}\nPick a different topic or edit that file.`);
  process.exit(1);
}

const place = site.type === 'hub' ? 'landowners' : `${site.stateName} landowners`;

const template = `---
state: ${stateKey}
title: ${JSON.stringify(topic)}
description: >-
  TODO one or two plain sentences describing what this article answers. This is
  the meta description and the summary on the articles index, so write it for a
  landowner deciding whether to click.
sources: []
status: draft
---

<!--
  DRAFT. Not visible on the site until status becomes "published", and that only
  happens after Clint reviews the rendered page.

  Rules for this article:

  1. Every factual claim about incentives, utilities, regulation or market
     activity needs a source in the frontmatter above, or it gets rewritten as
     general guidance. scripts/validate-content.mjs blocks publication otherwise.
  2. No invented numbers, prices, or timelines. If the real figure is not known,
     do not estimate one.
  3. No legal or tax advice. The disclaimer renders automatically at the end.
  4. Written for ${place}, not for investors or developers. Plain language,
     around an eighth grade reading level.
  5. No em dashes and no exclamation points anywhere. scripts/lint-copy.mjs
     enforces this.
  6. This text must be original. It cannot repeat passages from another state's
     version of the same article. scripts/check-duplicate-copy.mjs enforces this.
-->

TODO Open by answering the question in the title directly, in the first
paragraph. A landowner who reads only this paragraph should have the answer.

## TODO first section heading

TODO

## TODO second section heading

TODO

## What to do next

TODO Close with a concrete next step. Normally that is telling us about the
property so it can be looked at, with a reminder that there is no cost and no
obligation.
`;

mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, template, 'utf8');

console.log(`Created draft: ${path.replace(ROOT, '')}`);
console.log(`  state:  ${stateKey} (${site.type === 'hub' ? 'hub' : site.stateName})`);
console.log(`  url:    /articles/${slug}  (once published)`);
console.log('');
console.log('Next: write the article, add sources, then flip status to published');
console.log('after Clint approves the rendered preview.');
