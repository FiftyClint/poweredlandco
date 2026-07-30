import { BRAND, LEGAL_POSITIONING } from '../data/brand.mjs';
import { siteUrl } from '../data/sites.mjs';

/**
 * Schema.org builders. Organization goes on every page of every site; the rest
 * are added per page type.
 *
 * Note the deliberate absence of aggregateRating, review, and any numeric
 * claim. We have no reviews and no verifiable statistics, and inventing them
 * in structured data would be both dishonest and a manual action risk.
 */

export function organizationSchema(site) {
  const url = siteUrl(site);
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${url}/#organization`,
    name: BRAND.name,
    url,
    email: BRAND.email,
    description: LEGAL_POSITIONING,
    ...(site.type === 'hub'
      ? {}
      : { areaServed: { '@type': 'State', name: site.stateName } }),
    ...(site.type === 'hub' ? {} : { parentOrganization: { '@type': 'Organization', name: BRAND.name, url: `https://${BRAND.hubDomain}` } }),
  };
}

export function webPageSchema({ site, title, description, path }) {
  const url = siteUrl(site);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}${path}#webpage`,
    url: `${url}${path}`,
    name: title,
    description,
    isPartOf: { '@id': `${url}/#organization` },
  };
}

export function faqPageSchema(site, entries) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}

/** `trail` is [{ label, path }], root first, current page last. */
export function breadcrumbSchema(site, trail) {
  const url = siteUrl(site);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: `${url}${crumb.path}`,
    })),
  };
}

export function articleSchema({ site, article, path }) {
  const url = siteUrl(site);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    mainEntityOfPage: `${url}${path}`,
    publisher: { '@id': `${url}/#organization` },
    author: { '@type': 'Organization', name: BRAND.name },
    ...(article.published ? { datePublished: article.published } : {}),
    ...(article.updated ? { dateModified: article.updated } : {}),
    ...(article.sources?.length
      ? { citation: article.sources.map((s) => s.url) }
      : {}),
  };
}
