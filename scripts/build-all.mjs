#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { liveSites, allSites } from '../src/data/sites.node.mjs';

/**
 * Builds every live site into dist/<key>/.
 *
 * Sites with status "pending" are skipped and reported by name, so a skipped
 * site is always visible rather than silently missing from a deploy.
 */
const live = liveSites();
const pending = allSites().filter((s) => s.status === 'pending');

console.log(`Building ${live.length} site(s): ${live.map((s) => s.key).join(', ')}`);
if (pending.length > 0) {
  console.log(
    `Skipping ${pending.length} pending site(s): ${pending.map((s) => s.key).join(', ')}`,
  );
}
console.log('');

const failed = [];

for (const site of live) {
  process.stdout.write(`  ${site.key.padEnd(5)} ${site.domain} ... `);
  const result = spawnSync('npx', ['astro', 'build'], {
    env: { ...process.env, SITE: site.key },
    encoding: 'utf8',
  });

  if (result.status === 0) {
    const pages = /(\d+) page\(s\) built/.exec(result.stdout)?.[1] ?? '?';
    console.log(`ok (${pages} pages)`);
  } else {
    console.log('FAILED');
    console.error(result.stdout);
    console.error(result.stderr);
    failed.push(site.key);
  }
}

console.log('');
if (failed.length > 0) {
  console.error(`Build failed for: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`All ${live.length} site(s) built.`);
