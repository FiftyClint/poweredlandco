/**
 * Injects only the routes that belong to the site currently being built.
 *
 * Why this exists: a static Astro build emits every file under src/pages, but
 * the three site types need different route sets. A parked state must be a
 * single page with no dead links and no phantom sitemap entries, and the hub
 * has a states index that no state site should have. Rather than build every
 * page everywhere and try to hide the extras, the route templates live outside
 * src/pages and only the relevant ones get injected.
 *
 * src/pages therefore contains only 404.astro, which every site needs.
 */

const routeUrl = (path) => new URL(`../src/routes/${path}`, import.meta.url);

/** Pages shared by the hub and every state site. */
const COMMON_PAGES = [
  ['/how-it-works', 'common/how-it-works.astro'],
  ['/what-makes-land-qualify', 'common/what-makes-land-qualify.astro'],
  ['/faq', 'common/faq.astro'],
  ['/about', 'common/about.astro'],
  ['/privacy', 'common/privacy.astro'],
  ['/terms', 'common/terms.astro'],
  ['/articles', 'common/articles/index.astro'],
  ['/articles/[...id]', 'common/articles/[...id].astro'],
  // Where the fallback form lands when JavaScript is unavailable.
  ['/thank-you', 'common/thank-you.astro'],
];

/** Machine-readable files every domain needs, parked ones included. */
const SITE_FILES = [
  ['/robots.txt', 'files/robots.txt.mjs'],
  ['/llms.txt', 'files/llms.txt.mjs'],
];

function routesFor(site) {
  if (site.type === 'parked') {
    return [['/', 'parked/index.astro'], ...SITE_FILES];
  }

  if (site.type === 'hub') {
    return [
      ['/', 'hub/index.astro'],
      ['/states', 'hub/states.astro'],
      ...COMMON_PAGES,
      ...SITE_FILES,
    ];
  }

  // A state site. The state page lives at its own state name so the URL reads
  // as an answer to the search that brings people here, for example
  // /arkansas on arkansasdatacenterland.com.
  const slug = site.stateName.toLowerCase().replace(/\s+/g, '-');
  return [
    ['/', 'state/index.astro'],
    [`/${slug}`, 'state/state-page.astro'],
    ...COMMON_PAGES,
    ...SITE_FILES,
  ];
}

export default function siteRoutes(site) {
  return {
    name: 'poweredlandco:site-routes',
    hooks: {
      'astro:config:setup': ({ injectRoute }) => {
        for (const [pattern, entrypoint] of routesFor(site)) {
          injectRoute({ pattern, entrypoint: routeUrl(entrypoint) });
        }
      },
    },
  };
}

export { routesFor };
