#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { liveSites, allSites } from '../src/data/sites.node.mjs';

/**
 * Deploys every live site to its own Cloudflare Worker.
 *
 * One Worker per domain rather than one Worker serving all nineteen. Serving
 * nineteen hostnames from a single deployment would mean routing on the Host
 * header at request time, which turns a static site into a running program.
 * Separate deployments keep every site pure static, let a single state be
 * rolled back on its own, and mean a mistake on one domain cannot take down
 * the other eighteen.
 *
 * The sites are built here and uploaded finished. Cloudflare never builds
 * anything, so no build minutes are metered and the checks stay in CI where we
 * can see them fail.
 *
 *   node scripts/deploy.mjs            deploy every live site
 *   node scripts/deploy.mjs --only ar  deploy one
 *   node scripts/deploy.mjs --dry-run  print the commands without running them
 *
 * Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment.
 */

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

/** Worker name for a site. Stable, because renaming one orphans its domain. */
const workerName = (site) => `poweredlandco-${site.key}`;

const targets = liveSites().filter((s) => !only || s.key === only);

if (targets.length === 0) {
  console.error(
    only
      ? `No live site with key "${only}". Live: ${liveSites().map((s) => s.key).join(', ')}`
      : 'No live sites.',
  );
  process.exit(1);
}

if (!dryRun) {
  for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    if (!process.env[key]) {
      console.error(
        `${key} is not set.\n\n` +
          'Locally, export it before running. In GitHub Actions it comes from\n' +
          'repository secrets. See docs/DEPLOY.md.',
      );
      process.exit(1);
    }
  }
}

const pending = allSites().filter((s) => s.status === 'pending');
console.log(`Deploying ${targets.length} site(s): ${targets.map((s) => s.key).join(', ')}`);
if (pending.length > 0) {
  console.log(`Not deploying ${pending.length} pending site(s): ${pending.map((s) => s.key).join(', ')}`);
}
console.log('');

const failed = [];

for (const site of targets) {
  const dir = `./dist/${site.key}`;

  if (!existsSync(dir)) {
    console.error(`  ${site.key}: ${dir} does not exist. Run npm run build:all first.`);
    failed.push(site.key);
    continue;
  }

  const command = [
    'wrangler',
    'deploy',
    '--name',
    workerName(site),
    '--assets',
    dir,
    '--compatibility-date',
    '2026-07-01',
  ];

  process.stdout.write(`  ${site.key.padEnd(5)} ${site.domain.padEnd(34)} `);

  if (dryRun) {
    console.log(`\n    npx ${command.join(' ')}`);
    continue;
  }

  const result = spawnSync('npx', command, { encoding: 'utf8' });

  if (result.status === 0) {
    console.log('deployed');
  } else {
    console.log('FAILED');
    console.error(result.stdout);
    console.error(result.stderr);
    failed.push(site.key);
  }
}

console.log('');
if (failed.length > 0) {
  console.error(`Deploy failed for: ${failed.join(', ')}`);
  process.exit(1);
}

if (dryRun) {
  console.log('Dry run only. Nothing was deployed.');
} else {
  console.log(`Deployed ${targets.length} site(s).`);
  console.log('');
  console.log('A Worker serves nothing at a real address until its domain is');
  console.log('attached in the Cloudflare dashboard. That is a one time step per');
  console.log('domain, described in docs/DEPLOY.md.');
}
