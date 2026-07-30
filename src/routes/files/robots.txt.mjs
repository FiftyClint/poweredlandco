import { currentSite, siteUrl } from '../../data/sites.mjs';

/**
 * Per-domain robots.txt.
 *
 * Everything is crawlable except the form landing page, which exists only as a
 * post-submission destination and would be a thin, duplicated result if indexed
 * across 19 domains.
 */
export function GET() {
  const site = currentSite();
  const base = siteUrl(site);

  const lines = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /thank-you',
    '',
    `Sitemap: ${base}/sitemap-index.xml`,
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
