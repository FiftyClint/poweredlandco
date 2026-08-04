#!/usr/bin/env node
import {
  findZone,
  createZone,
  listDnsRecords,
  deleteDnsRecord,
  createProxiedRecord,
  listWorkerRoutes,
  createWorkerRoute,
} from './lib/cloudflare.mjs';
import { liveSites, allSites } from '../src/data/sites.node.mjs';
import { workerName } from './lib/worker-name.mjs';

/**
 * Takes domains from "registered at GoDaddy" to "ready to serve our site".
 *
 * For each domain it adds the zone to Cloudflare if it is not there, prints the
 * two nameservers to paste into GoDaddy, and clears out the registrar records
 * that would otherwise keep the domain pointing at a parking page.
 *
 * Two steps this cannot do.
 *
 * Changing the nameservers happens at the registrar, and the GoDaddy access
 * here is limited to looking domains up. GoDaddy does let you select several
 * domains in My Products and set nameservers on all of them at once, so that
 * stays one action rather than one per domain.
 *
 * Pointing a domain at its Worker used to be the other one, because a custom
 * domain is an account level object and this token only has domain scope. A
 * Worker route reaches the same place from the other side: a proxied record
 * plus a route are both domain level, so this token can do it and the visitor
 * cannot tell the difference. That turned sixteen rounds of dashboard clicking
 * into one run.
 *
 * Uses CLOUDFLARE_ZONE_TOKEN, which is a different credential from the one that
 * publishes the sites. Neither can do the other's job, so a mistake with either
 * cannot take down what the other is responsible for.
 *
 *   node scripts/setup-zones.mjs --dry-run      say what would change
 *   node scripts/setup-zones.mjs                do it
 *   node scripts/setup-zones.mjs --only ar      one site
 *
 * Safe to run repeatedly. It only ever removes records it is confident are the
 * registrar's, and it never touches a zone twice.
 */

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const targets = liveSites().filter((s) => !only || s.key === only);

if (targets.length === 0) {
  console.error(
    only
      ? `No live site with key "${only}". Live: ${liveSites().map((s) => s.key).join(', ')}`
      : 'No live sites.',
  );
  process.exit(1);
}

/**
 * Whether a record is the registrar's rather than ours.
 *
 * Deliberately narrow. Anything that carries meaning we cannot reconstruct is
 * left alone, because a wrong delete here is invisible until somebody's mail
 * stops arriving:
 *
 *   TXT   holds SPF, DKIM and DMARC. Removing one quietly breaks email
 *         authentication and the symptom appears days later at the recipient.
 *   MX    is where mail goes.
 *   NS
 *   SOA   are managed by Cloudflare and cannot be deleted anyway.
 *
 * What is removed is the web pointing: the A, AAAA and CNAME records on the
 * apex and on www, which point at the registrar's parking page, plus
 * _domainconnect, which exists only to let third parties reconfigure GoDaddy's
 * DNS and does nothing once we have left it.
 *
 * Our own records are created by wrangler when the Worker's custom domain is
 * attached, so there is nothing here worth keeping.
 */
/*
 * Addresses that mean "this record exists so Cloudflare has something to proxy",
 * not "the site is here". When a Worker is attached to a custom domain,
 * Cloudflare creates a proxied record pointing at one of these and serves the
 * Worker itself. The address is never contacted.
 *
 * This list is why the dry run default earned its place. The first real run
 * offered to delete two AAAA records on arkansasdatacenterland.com pointing at
 * 100::, which were not the registrar's leftovers at all. They were the records
 * Cloudflare had created for the live custom domain, and deleting them would
 * have taken the site off the internet while every check still reported green.
 */
const PROXY_PLACEHOLDERS = new Set(['100::', '192.0.2.1', '192.0.2.0']);

const isCloudflareManaged = (record) =>
  record.proxied === true && PROXY_PLACEHOLDERS.has((record.content ?? '').trim());

const isRegistrarRecord = (record, domain) => {
  const name = record.name.toLowerCase();
  const apex = domain.toLowerCase();

  /* Cloudflare's own. Removing these unattaches a working domain. */
  if (isCloudflareManaged(record)) return false;

  if (name === `_domainconnect.${apex}` && record.type === 'CNAME') return true;

  const pointsAtWeb = ['A', 'AAAA', 'CNAME'].includes(record.type);
  const onApexOrWww = name === apex || name === `www.${apex}`;

  return pointsAtWeb && onApexOrWww;
};

const pending = allSites().filter((s) => s.status === 'pending');
console.log(`Checking ${targets.length} domain(s).`);
if (pending.length > 0) {
  console.log(`Skipping ${pending.length} site(s) not built yet: ${pending.map((s) => s.key).join(', ')}`);
}
if (dryRun) console.log('Dry run. Nothing will be changed.');
console.log('');

const needNameservers = [];
const failed = [];
const throttled = [];

/*
 * Cloudflare caps how many zones an account can hold in the pending state, and
 * answers 1118 once you reach it. It clears itself as earlier domains activate.
 *
 * Not a failure, so it does not fail the run. Reporting it as one would train
 * everybody to ignore a red cross on this workflow, which is the last thing you
 * want on the job that edits DNS.
 */
const isZoneLimit = (error) => error.errors?.some((e) => e.code === 1118);

for (const site of targets) {
  console.log(`${site.domain}`);

  let zone;
  try {
    zone = await findZone(site.domain);
  } catch (error) {
    console.log(`  could not look it up: ${error.message}`);
    failed.push(site.domain);
    console.log('');
    continue;
  }

  if (!zone) {
    if (dryRun) {
      console.log('  would be added to Cloudflare');
      console.log('');
      continue;
    }
    try {
      zone = await createZone(site.domain);
      console.log('  added to Cloudflare');
    } catch (error) {
      if (isZoneLimit(error)) {
        console.log('  waiting: Cloudflare will not hold any more pending domains yet');
        throttled.push(site.domain);
      } else {
        console.log(`  could not be added: ${error.message}`);
        failed.push(site.domain);
      }
      console.log('');
      continue;
    }
  }

  console.log(`  status: ${zone.status}`);

  if (zone.status !== 'active') {
    needNameservers.push({ domain: site.domain, nameservers: zone.name_servers ?? [] });
  }

  let records;
  try {
    records = await listDnsRecords(zone.id);
  } catch (error) {
    console.log(`  could not read its records: ${error.message}`);
    failed.push(site.domain);
    console.log('');
    continue;
  }

  const stale = records.filter((r) => isRegistrarRecord(r, site.domain));
  const kept = records.filter((r) => !isRegistrarRecord(r, site.domain));

  if (stale.length === 0) {
    console.log('  no registrar records left to clear');
  }

  for (const record of stale) {
    const label = `${record.type} ${record.name} -> ${record.content}`;
    if (dryRun) {
      console.log(`  would delete  ${label}`);
      continue;
    }
    try {
      await deleteDnsRecord(zone.id, record.id);
      console.log(`  deleted  ${label}`);
    } catch (error) {
      console.log(`  could not delete ${label}: ${error.message}`);
      failed.push(site.domain);
    }
  }

  for (const record of kept) {
    const why = isCloudflareManaged(record) ? ' (Cloudflare serves the Worker here)' : '';
    console.log(`  kept     ${record.type} ${record.name}${why}`);
  }

  /*
   * Point the domain and its www form at the Worker.
   *
   * Both hostnames matter. The apex is what gets printed and linked, and www is
   * what a good number of people type regardless of what you printed. A domain
   * where only one of the two resolves looks broken to whoever guessed wrong,
   * and this audience guesses www more often than most.
   *
   * A hostname that already has a record is left completely alone. That is how
   * a domain attached by hand in the dashboard survives this script: the custom
   * domain created its own record, we see it, and we do not touch it.
   */
  const apex = site.domain.toLowerCase();
  const worker = workerName(site);
  const existingNames = new Set(records.map((r) => r.name.toLowerCase()));

  let routes = [];
  try {
    routes = await listWorkerRoutes(zone.id);
  } catch (error) {
    console.log(`  could not read its Worker routes: ${error.message}`);
    failed.push(site.domain);
    console.log('');
    continue;
  }
  const routed = new Set(routes.map((r) => r.pattern.toLowerCase().replace(/\/\*$/, '')));

  for (const host of [apex, `www.${apex}`]) {
    if (existingNames.has(host)) {
      console.log(`  serving  ${host}`);
      continue;
    }

    if (dryRun) {
      console.log(`  would point  ${host} at ${worker}`);
      continue;
    }

    try {
      await createProxiedRecord(zone.id, host);
      if (!routed.has(host)) await createWorkerRoute(zone.id, `${host}/*`, worker);
      console.log(`  pointed  ${host} at ${worker}`);
    } catch (error) {
      console.log(`  could not point ${host} at ${worker}: ${error.message}`);
      failed.push(site.domain);
    }
  }

  console.log('');
}

if (needNameservers.length > 0) {
  console.log('---');
  console.log('');
  console.log('These domains are waiting on their nameservers being changed at the');
  console.log('registrar. In GoDaddy you can select several domains at once in My');
  console.log('Products and set nameservers on all of them together.');
  console.log('');
  /*
   * Grouped by nameserver pair rather than listed per domain.
   *
   * Cloudflare assigns nameservers per zone, not per account, and a zone
   * created later can get a different pair. An earlier version of this printed
   * each domain with its own pair and then said they were "usually" the same,
   * which is worse than useless: it invites you to enter one pair everywhere
   * and gives you no way to see that you should not have. Grouping makes a
   * second pair impossible to miss, and these values are read from Cloudflare
   * rather than assumed.
   */
  const byPair = new Map();
  for (const { domain, nameservers } of needNameservers) {
    const key = nameservers.join('\n');
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(domain);
  }

  if (byPair.size > 1) {
    console.log(`These do NOT all use the same nameservers. There are ${byPair.size}`);
    console.log('different pairs below. Enter the pair listed above each group, for');
    console.log('the domains in that group only.');
    console.log('');
  }

  for (const [key, domains] of byPair) {
    for (const ns of key.split('\n')) console.log(`  ${ns}`);
    for (const domain of domains) console.log(`      ${domain}`);
    console.log('');
  }
}

if (throttled.length > 0) {
  console.log('---');
  console.log('');
  console.log('Cloudflare would not accept these yet, because an account can only');
  console.log('hold so many domains that are waiting on their nameservers:');
  console.log('');
  for (const domain of throttled) console.log(`  ${domain}`);
  console.log('');
  console.log('Nothing is wrong. Change the nameservers on the domains above, wait');
  console.log('for them to go active, then run this again and these will go in.');
  console.log('');
}

/*
 * console.log rather than console.error even for failures. Actions interleaves
 * the two streams by arrival rather than by order written, so an error printed
 * to stderr lands in the middle of unrelated output and reads as though it
 * belongs to whatever is next to it. One stream keeps the log readable.
 */
if (failed.length > 0) {
  console.log(`Problems with: ${[...new Set(failed)].join(', ')}`);
  process.exitCode = 1;
}

console.log('Done. Nothing needs attaching in the dashboard: every hostname above');
console.log('either already had a record or has been pointed at its Worker here.');
console.log('A domain still shown as pending starts serving on its own once its');
console.log('nameservers take effect.');
