#!/usr/bin/env node
import { findZone, createZone, listDnsRecords, deleteDnsRecord } from './lib/cloudflare.mjs';
import { liveSites, allSites } from '../src/data/sites.node.mjs';

/**
 * Takes domains from "registered at GoDaddy" to "ready to serve our site".
 *
 * For each domain it adds the zone to Cloudflare if it is not there, prints the
 * two nameservers to paste into GoDaddy, and clears out the registrar records
 * that would otherwise keep the domain pointing at a parking page.
 *
 * The one step this cannot do is change the nameservers, because that happens
 * at the registrar and the GoDaddy access here is limited to looking domains
 * up. GoDaddy does let you select several domains in My Products and set
 * nameservers on all of them at once, so that stays one action rather than one
 * per domain.
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
const isRegistrarRecord = (record, domain) => {
  const name = record.name.toLowerCase();
  const apex = domain.toLowerCase();

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
      console.log(`  could not be added: ${error.message}`);
      failed.push(site.domain);
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
    console.log(`  kept     ${record.type} ${record.name}`);
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
  for (const { domain, nameservers } of needNameservers) {
    console.log(`  ${domain}`);
    for (const ns of nameservers) console.log(`      ${ns}`);
  }
  console.log('');
  console.log('Cloudflare usually assigns the same pair to every domain on an');
  console.log('account, so check whether they match before typing them nineteen');
  console.log('times.');
  console.log('');
}

if (failed.length > 0) {
  console.error(`Problems with: ${[...new Set(failed)].join(', ')}`);
  process.exit(1);
}

console.log('Done. Domains whose status is active will be attached to their');
console.log('Worker on the next deploy, with no further clicking.');
