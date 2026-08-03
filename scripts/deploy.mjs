#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { liveSites, allSites } from '../src/data/sites.node.mjs';
import { findZone } from './lib/cloudflare.mjs';

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
 * Each Worker also carries the small script in workers/site/ so the site can
 * answer its own form submissions at /api/lead. Cloudflare serves the built
 * files directly and only runs that script for /api/ paths, so the pages stay
 * exactly as static as they were. NOTION_TOKEN is pushed as a per-Worker secret
 * so the token lives on Cloudflare and never in a built file.
 *
 *   node scripts/deploy.mjs            deploy every live site
 *   node scripts/deploy.mjs --only ar  deploy one
 *   node scripts/deploy.mjs --dry-run  print the commands without running them
 *
 * Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment, and
 * NOTION_TOKEN if the sites are built to use the built-in receiver.
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

const notionToken = (process.env.NOTION_TOKEN ?? '').trim();
if (!dryRun && !notionToken) {
  console.log('NOTION_TOKEN is not set, so no lead receiver secret will be pushed.');
  console.log('Only do this deliberately. The sites will serve, but /api/lead will');
  console.log('answer with an error rather than saving a submission.');
  console.log('');
}

/*
 * Written fresh for each site and deleted afterwards. A config file rather than
 * command line flags because run_worker_first and not_found_handling have no
 * flag equivalents, and those two settings are what keep the pages served
 * straight from disk while form posts still reach the Worker.
 */
const CONFIG_PATH = './wrangler.generated.jsonc';

const configFor = (site, routes = []) => ({
  $schema: './node_modules/wrangler/config-schema.json',
  name: workerName(site),
  main: 'workers/site/index.mjs',
  compatibility_date: '2026-07-01',
  assets: {
    directory: `dist/${site.key}`,
    binding: 'ASSETS',
    // Serve the designed 404 page instead of Cloudflare's bare one.
    not_found_handling: '404-page',
    // Everything except /api/ is served from disk without waking the Worker.
    run_worker_first: ['/api/*'],
  },
  ...(routes.length > 0 ? { routes } : {}),
});

/**
 * Whether this domain is ready to be attached to its Worker, and the routes to
 * do it with.
 *
 * A domain can only be attached once its nameservers actually point at
 * Cloudflare, which is the one step in this whole process that has to happen at
 * the registrar. Asking Cloudflare rather than tracking it by hand means a
 * domain wires itself up on the first deploy after it goes active, with nothing
 * to remember and nothing to click.
 *
 * Every failure here is deliberately non-fatal. A token without permission to
 * read zones, or a domain that has not been added yet, must not stop the site
 * being published. Publishing still works; only the custom domain waits.
 */
const routesFor = async (site) => {
  try {
    const zone = await findZone(site.domain);
    if (!zone) return { routes: [], note: 'not added to Cloudflare yet' };
    if (zone.status !== 'active') return { routes: [], note: `nameservers ${zone.status}` };
    return {
      routes: [
        { pattern: site.domain, custom_domain: true },
        { pattern: `www.${site.domain}`, custom_domain: true },
      ],
      note: 'custom domain',
    };
  } catch (error) {
    return { routes: [], note: 'domain check skipped' };
  }
};

/**
 * The one line of a wrangler failure worth printing.
 *
 * Its output is long and mostly account tables. The ERROR line names the API
 * call and the reason, which is the part that says what to fix.
 */
const lastError = (result) => {
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  // eslint-disable-next-line no-control-regex
  const plain = text.replace(/\[[0-9;]*m/g, '');
  const line = plain.split('\n').find((l) => l.includes('[ERROR]') || l.includes('code:'));
  return (line ?? 'no error line found in wrangler output').trim();
};

const failed = [];

for (const site of targets) {
  const dir = `./dist/${site.key}`;

  if (!existsSync(dir)) {
    console.error(`  ${site.key}: ${dir} does not exist. Run npm run build:all first.`);
    failed.push(site.key);
    continue;
  }

  const { routes, note: initialNote } = await routesFor(site);
  let note = initialNote;
  const config = configFor(site, routes);

  process.stdout.write(`  ${site.key.padEnd(5)} ${site.domain.padEnd(34)} `);

  if (dryRun) {
    console.log('');
    console.log(`    ${note}`);
    console.log(`    ${JSON.stringify(config)}`);
    console.log(`    npx wrangler deploy -c ${CONFIG_PATH}`);
    if (notionToken) console.log(`    npx wrangler secret put NOTION_TOKEN -c ${CONFIG_PATH}`);
    continue;
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

  const run = () => spawnSync('npx', ['wrangler', 'deploy', '-c', CONFIG_PATH], { encoding: 'utf8' });

  let result = run();

  /*
   * Attaching a domain and publishing a site are separate jobs, and only one of
   * them is urgent. If the domain wiring fails, the site must still go out.
   *
   * This is not hypothetical. The first time a domain went live, wrangler
   * uploaded the Worker, then failed applying the routes because the API token
   * could not manage Workers Routes on a zone. The deploy went red over a
   * domain that was already attached by hand and working, which is the tail
   * wagging the dog.
   *
   * So a failure with routes declared is retried without them. The site
   * publishes, any custom domain already attached is left exactly as it is, and
   * the run says plainly that the wiring needs attention.
   */
  if (result.status !== 0 && routes.length > 0) {
    const firstAttempt = result;
    writeFileSync(CONFIG_PATH, JSON.stringify(configFor(site, []), null, 2));
    result = run();

    if (result.status === 0) {
      note = 'published, domain wiring needs a wider token';
      console.log('');
      console.log('    Could not attach the domain, so it was published without it.');
      console.log('    Any domain already attached is untouched. See DEPLOY.md Part 6.');
      console.log(`    ${lastError(firstAttempt)}`);
      process.stdout.write(`  ${''.padEnd(5)} ${''.padEnd(34)} `);
    }
  }

  if (result.status !== 0) {
    console.log('FAILED');
    console.error(result.stdout);
    console.error(result.stderr);
    failed.push(site.key);
    continue;
  }

  if (!notionToken) {
    console.log(`deployed (${note}), no receiver secret`);
    continue;
  }

  /*
   * Pushed after the deploy because a secret cannot be set on a Worker that
   * does not exist yet. On a brand new site that leaves a few seconds where
   * /api/lead answers 503, which the form reports honestly as a failure rather
   * than thanking anybody.
   */
  const secret = spawnSync(
    'npx',
    ['wrangler', 'secret', 'put', 'NOTION_TOKEN', '-c', CONFIG_PATH],
    { encoding: 'utf8', input: notionToken },
  );

  if (secret.status === 0) {
    console.log(`deployed (${note})`);
  } else {
    console.log('DEPLOYED, SECRET FAILED');
    // The token goes in on stdin and never appears in the output, so this is
    // safe to print into a CI log.
    console.error(secret.stdout);
    console.error(secret.stderr);
    failed.push(site.key);
  }
}

rmSync(CONFIG_PATH, { force: true });

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
