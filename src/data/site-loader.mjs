import { parse as parseYaml } from 'yaml';
import { siteSchema } from './schema.mjs';
import { ACCENTS } from './brand.mjs';

/**
 * Shared core for loading site data.
 *
 * There are two entry points because there are two very different runtimes:
 *
 *   sites.mjs       imported by .astro components, bundled by Vite. It cannot
 *                   read the filesystem, because at runtime the code lives in a
 *                   build chunk with no YAML files next to it. It inlines the
 *                   files at build time instead.
 *
 *   sites.node.mjs  imported by astro.config.mjs and the scripts in scripts/,
 *                   which run in plain Node against the real source tree and
 *                   can simply read the directory.
 *
 * Both hand their raw file contents to createSiteApi below, so parsing,
 * validation and the public API exist in exactly one place.
 */

/** @param entries [filename, yamlText][] */
export function createSiteApi(entries) {
  const sites = new Map();

  for (const [filename, text] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
    const parsed = siteSchema.safeParse(parseYaml(text));

    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid site data in src/data/sites/${filename}:\n${detail}`);
    }

    const site = parsed.data;
    const expectedKey = filename.replace(/\.yaml$/, '');
    if (site.key !== expectedKey) {
      throw new Error(
        `Site key mismatch: src/data/sites/${filename} declares key "${site.key}". ` +
          'The filename and the key must match so builds are addressable by key.',
      );
    }
    if (sites.has(site.key)) {
      throw new Error(`Duplicate site key "${site.key}"`);
    }

    sites.set(site.key, { ...site, palette: ACCENTS[site.accent] });
  }

  if (!sites.has('hub')) {
    throw new Error('No hub site found. src/data/sites/hub.yaml is required.');
  }

  /** Every site in the network, including ones not launched yet. */
  const allSites = () => [...sites.values()];

  /** Sites that build:all actually builds and deploys. */
  const liveSites = () => allSites().filter((s) => s.status === 'live');

  /** Live state and parked sites, ordered for display on the hub. */
  const liveStateSites = () =>
    liveSites()
      .filter((s) => s.type !== 'hub')
      .sort((a, b) => a.stateName.localeCompare(b.stateName));

  const getSite = (key) => {
    const site = sites.get(key);
    if (!site) {
      throw new Error(
        `Unknown site key "${key}". Known keys: ${[...sites.keys()].join(', ')}`,
      );
    }
    return site;
  };

  /**
   * The site this build is for. Astro builds once per site with SITE set;
   * defaulting to the hub keeps `astro dev` working with no ceremony.
   */
  const currentSite = () => getSite(process.env.SITE || 'hub');

  return { allSites, liveSites, liveStateSites, getSite, currentSite };
}

export const siteUrl = (site) => `https://${site.domain}`;

/** Turns a glob result keyed by path into the [filename, text] pairs above. */
export const entriesFromGlob = (modules) =>
  Object.entries(modules).map(([path, text]) => [path.split('/').pop(), text]);
