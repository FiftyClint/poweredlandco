#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

/**
 * Checks that every URL these sites cite still resolves.
 *
 * The pages make statutory claims: investment thresholds, job counts, sunset
 * dates. Those claims are only worth anything because they carry a link to the
 * source, and a citation pointing at a dead page is worse than no citation. It
 * looks like diligence while providing none, and it decays silently. Nothing
 * about the repo changes when a state redesigns its website.
 *
 * Deliberately NOT part of the deploy. A third party's server being down must
 * never stop this network publishing, and wiring it into the deploy would mean
 * exactly that. It runs on its own schedule and reports.
 *
 *   node scripts/check-sources.mjs           check everything
 *   node scripts/check-sources.mjs --watch   check the monitoring watchlists too
 *
 * Exits non-zero only for permanent failures, meaning 404 and 410. A timeout or
 * a 500 is somebody else having a bad afternoon, not a citation that has rotted,
 * and treating the two the same trains everyone to ignore the result.
 */

const args = process.argv.slice(2);
const includeWatch = args.includes('--watch');

const ROOT = new URL('..', import.meta.url).pathname;

/** Everything this project asserts on the strength of somebody else's page. */
const collectUrls = () => {
  const found = [];

  const siteDir = join(ROOT, 'src/data/sites');
  for (const file of readdirSync(siteDir).filter((f) => f.endsWith('.yaml'))) {
    const site = parse(readFileSync(join(siteDir, file), 'utf8'));
    for (const source of site?.incentives?.sources ?? []) {
      found.push({ url: source.url, label: source.label, where: `sites/${file}` });
    }
    if (includeWatch) {
      for (const entry of site?.watch ?? []) {
        found.push({ url: entry.url, label: entry.label, where: `sites/${file} watch` });
      }
    }
  }

  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.md') || path.endsWith('.mdx')) {
        const text = readFileSync(path, 'utf8');
        const match = text.match(/^---\n([\s\S]*?)\n---/);
        if (!match) continue;
        const front = parse(match[1]);
        for (const source of front?.sources ?? []) {
          found.push({
            url: source.url,
            label: source.label,
            where: path.slice(ROOT.length),
          });
        }
      }
    }
  };
  walk(join(ROOT, 'src/content/articles'));

  return found;
};

const all = collectUrls();

/* One request per address, with every page that cites it listed against it. */
const byUrl = new Map();
for (const item of all) {
  if (!byUrl.has(item.url)) byUrl.set(item.url, []);
  byUrl.get(item.url).push(item);
}

console.log(`Checking ${byUrl.size} unique source(s) cited by ${all.length} reference(s).`);
console.log('');

/**
 * HEAD first because it is cheap, then GET, because a surprising number of
 * government sites answer HEAD with 403 or 405 while serving GET perfectly.
 * Reporting those as dead would be wrong and would bury the real failures.
 */
const check = async (url) => {
  for (const method of ['HEAD', 'GET']) {
    try {
      const response = await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
        headers: { 'user-agent': 'PoweredLandCo source checker' },
      });
      if (response.ok) return { ok: true, status: response.status, url: response.url };
      if (method === 'GET') return { ok: false, status: response.status, url: response.url };
    } catch (error) {
      if (method === 'GET') return { ok: false, status: 0, error: error.message };
    }
  }
  return { ok: false, status: 0, error: 'no response' };
};

const gone = [];
const shaky = [];
const moved = [];

for (const [url, citations] of byUrl) {
  const result = await check(url);
  const where = citations.map((c) => c.where).join(', ');

  if (result.ok) {
    /*
     * A redirect is not a failure, but a permanent one is a citation slowly
     * drifting away from what it claims to point at, so it is worth seeing.
     */
    if (result.url && result.url !== url) {
      moved.push({ url, to: result.url, where });
      console.log(`  moved   ${url}`);
      console.log(`          now ${result.url}`);
    } else {
      console.log(`  ok      ${url}`);
    }
    continue;
  }

  if (result.status === 404 || result.status === 410) {
    gone.push({ url, status: result.status, where, label: citations[0].label });
    console.log(`  GONE    ${url}  (${result.status})`);
  } else {
    shaky.push({ url, status: result.status, error: result.error, where });
    console.log(`  ?       ${url}  (${result.status || result.error})`);
  }
}

console.log('');

if (moved.length > 0) {
  console.log(`${moved.length} source(s) now redirect. Worth updating when convenient:`);
  for (const m of moved) console.log(`  ${m.where}\n    ${m.url}\n    -> ${m.to}`);
  console.log('');
}

if (shaky.length > 0) {
  console.log(`${shaky.length} source(s) did not answer cleanly. Usually temporary:`);
  for (const s of shaky) console.log(`  ${s.where}\n    ${s.url} (${s.status || s.error})`);
  console.log('');
}

if (gone.length === 0) {
  console.log('No dead citations. Every claim on these sites still points somewhere real.');
  process.exit(0);
}

console.log(`${gone.length} DEAD citation(s). These pages assert facts on a source that no longer exists:`);
console.log('');
for (const g of gone) {
  console.log(`  ${g.label}`);
  console.log(`    ${g.url} (${g.status})`);
  console.log(`    cited by ${g.where}`);
  console.log('');
}
console.log('Find the current location of each, or find a replacement source, and');
console.log('update the citation. If no source can be found, the claim it supports');
console.log('has to come off the page.');
process.exit(1);
