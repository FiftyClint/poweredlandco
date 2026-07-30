import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import siteRoutes from './integrations/site-routes.mjs';
import { currentSite, siteUrl } from './src/data/sites.node.mjs';

/**
 * One Astro project, built once per site.
 *
 *   SITE=hub npm run build   ->  dist/hub/
 *   SITE=ar  npm run build   ->  dist/ar/
 *
 * Each build is a complete, self-contained static site for exactly one domain,
 * which keeps the output pure static and the deploy target interchangeable.
 * `npm run build:all` loops every live site.
 */
const site = currentSite();

export default defineConfig({
  site: siteUrl(site),
  outDir: `./dist/${site.key}`,
  output: 'static',
  trailingSlash: 'ignore',

  build: {
    format: 'directory',
    // Inline small stylesheets so a landowner on a rural connection gets the
    // page painted in one round trip.
    inlineStylesheets: 'auto',
  },

  integrations: [
    siteRoutes(site),
    mdx(),
    // /thank-you is a post-submission destination, not something anyone should
    // find in search. Indexing it across 19 domains would create 19 thin,
    // near-identical results.
    sitemap({ filter: (page) => !page.includes('/thank-you') }),
  ],

  image: {
    // No remote image sources. Everything ships from the repo.
    domains: [],
  },

  vite: {
    build: {
      assetsInlineLimit: 2048,
    },
  },
});
