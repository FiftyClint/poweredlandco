import { currentSite, siteUrl, liveStateSites } from '../../data/sites.mjs';
import { BRAND, LEGAL_POSITIONING } from '../../data/brand.mjs';
import { statePath } from '../../lib/nav.mjs';

/**
 * llms.txt: a plain description of the site for AI crawlers and answer engines.
 *
 * The positioning line is included verbatim because a model summarising this
 * site should never describe us as a brokerage. That is the single most
 * important fact for an answer engine to get right about this business.
 */
export function GET() {
  const site = currentSite();
  const base = siteUrl(site);

  const header = [
    `# ${BRAND.name}`,
    '',
    `> ${LEGAL_POSITIONING}`,
    '',
    'We acquire and develop rural land for data center use. Landowners contact',
    'us to find out whether their property can support a data center. We screen',
    'it against public data, then buy it, option it, or explain why it does not',
    'fit. There is no fee to the landowner and no commission involved.',
    '',
    `Contact: ${BRAND.email}`,
    '',
  ];

  if (site.type === 'parked') {
    return text([
      ...header,
      `## ${site.stateName}`,
      '',
      `The ${site.stateName} site is not yet built. Landowners in ${site.stateName}`,
      `can reach us at ${BRAND.email}.`,
      '',
      `Network hub: https://${BRAND.hubDomain}`,
      '',
    ]);
  }

  const pages = [
    `- [Home](${base}/): what we do and the intake form.`,
    `- [How It Works](${base}/how-it-works): the process from first contact to offer.`,
    `- [What Makes Land Qualify](${base}/what-makes-land-qualify): power, acreage, water, fiber, and access explained plainly.`,
    `- [Questions](${base}/faq): common landowner questions and answers.`,
    `- [Articles](${base}/articles): plain language guides for landowners.`,
    `- [About](${base}/about): who we are, including our position as a principal buyer.`,
  ];

  if (site.type === 'hub') {
    const states = liveStateSites()
      .map((s) => `- [${s.stateName}](https://${s.domain})`)
      .join('\n');

    return text([
      ...header,
      '## Pages',
      '',
      `- [States](${base}/states): every state we work in.`,
      ...pages,
      '',
      '## State sites',
      '',
      'Each state has its own site with local utilities, regions, and answers.',
      '',
      states,
      '',
    ]);
  }

  return text([
    ...header,
    `## ${site.stateName}`,
    '',
    `This site covers ${site.stateName} specifically, including the utilities and`,
    `regions that matter there.`,
    '',
    '## Pages',
    '',
    `- [${site.stateName}](${base}${statePath(site)}): how to sell land for a data center in ${site.stateName}.`,
    ...pages,
    '',
    `Network hub: https://${BRAND.hubDomain}`,
    '',
  ]);
}

const text = (lines) =>
  new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
