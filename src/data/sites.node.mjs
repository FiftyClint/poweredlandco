import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSiteApi, siteUrl } from './site-loader.mjs';

/**
 * Site data for plain Node: astro.config.mjs and everything in scripts/.
 *
 * These run against the real source tree, so reading the directory is both
 * possible and preferable. Components use sites.mjs instead.
 */
const SITES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'sites');

const entries = readdirSync(SITES_DIR)
  .filter((file) => file.endsWith('.yaml'))
  .map((file) => [file, readFileSync(join(SITES_DIR, file), 'utf8')]);

const api = createSiteApi(entries);

export const { allSites, liveSites, liveStateSites, getSite, currentSite } = api;
export { siteUrl };
