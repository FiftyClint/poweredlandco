import { createSiteApi, entriesFromGlob, siteUrl } from './site-loader.mjs';

/**
 * Site data for .astro components.
 *
 * The YAML is inlined at build time by Vite, so no filesystem access happens at
 * runtime. Node consumers (astro.config.mjs, scripts/) use sites.node.mjs
 * instead; both go through the same parser and validator.
 */
const raw = import.meta.glob('./sites/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const api = createSiteApi(entriesFromGlob(raw));

export const { allSites, liveSites, liveStateSites, getSite, currentSite } = api;
export { siteUrl };
