import { BRAND } from '../data/brand.mjs';

/** URL of the state page on a state site, for example "/arkansas". */
export const statePath = (site) =>
  `/${site.stateName.toLowerCase().replace(/\s+/g, '-')}`;

/**
 * Primary navigation. Derived from the site type so it can never drift from
 * the routes that integrations/site-routes.mjs actually injected.
 */
export function primaryNav(site) {
  const shared = [
    { href: '/how-it-works', label: 'How It Works' },
    { href: '/what-makes-land-qualify', label: 'What Qualifies' },
    { href: '/articles', label: 'Articles' },
    { href: '/faq', label: 'Questions' },
    { href: '/about', label: 'About' },
  ];

  if (site.type === 'hub') {
    return [{ href: '/states', label: 'States' }, ...shared];
  }
  return [{ href: statePath(site), label: site.stateName }, ...shared];
}

export function footerNav(site) {
  return [...primaryNav(site), { href: '/privacy', label: 'Privacy' }, { href: '/terms', label: 'Terms' }];
}

/**
 * Every state site links back to the hub and the hub links out to every state
 * site. Internal linking across the network is a stated requirement, so it is
 * generated rather than hand maintained.
 */
export function networkLink(site) {
  if (site.type === 'hub') return null;
  return {
    href: `https://${BRAND.hubDomain}`,
    label: `${BRAND.name}`,
  };
}
