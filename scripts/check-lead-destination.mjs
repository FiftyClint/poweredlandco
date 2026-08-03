#!/usr/bin/env node
import {
  hasLeadDestination,
  crmxEmbed,
  leadWebhook,
  LEAD_ENDPOINT,
} from '../src/data/lead-capture.mjs';

/**
 * Refuses to deploy sites whose intake form has nowhere to send a submission.
 *
 * This exists because it already happened. With no CRMX embed and no webhook
 * the form posted back to its own page, the page answered 200, and the visitor
 * was told "Thank you. We have your information." Their details had gone
 * nowhere. A landowner would have found out by never hearing from anybody.
 *
 * FormSlot no longer renders a form in that situation, showing an email address
 * instead. This check is the second line: it means a build that would ship a
 * lead-capture site with no lead capture cannot reach a live domain at all.
 *
 * Runs in the deploy workflow only. Local development and previews are
 * deliberately unaffected, since needing a live CRM to work on typography would
 * be its own kind of broken.
 */

if (hasLeadDestination()) {
  const via = crmxEmbed()
    ? 'CRMX embed'
    : leadWebhook() === LEAD_ENDPOINT
      ? `built-in receiver at ${LEAD_ENDPOINT}, which writes to the Notion database`
      : 'configured webhook';
  console.log(`Lead destination check passed. Submissions go to the ${via}.`);
  process.exit(0);
}

console.error(
  [
    'Lead destination check FAILED.',
    '',
    'Nothing would receive a form submission, so deploying now would put a',
    'lead capture site online with no lead capture.',
    '',
    'The sites are still usable meanwhile: FormSlot shows an email address',
    'rather than a form, so a landowner reaches a real person instead of a',
    'thank you message that is not true.',
    '',
    'Set one of these:',
    '  NOTION_TOKEN          turns on the built-in receiver, which writes',
    '                        straight into the Landowner Leads database. This',
    '                        is the normal path. In GitHub Actions it comes',
    '                        from the repository secret of the same name.',
    '  PUBLIC_LEAD_WEBHOOK   send submissions somewhere else instead',
    '  PUBLIC_CRMX_EMBED     replace our form with a CRMX one',
    '',
    'Currently:',
    `  NOTION_TOKEN          ${process.env.NOTION_TOKEN ? 'set' : 'not set'}`,
    `  PUBLIC_LEAD_WEBHOOK   ${process.env.PUBLIC_LEAD_WEBHOOK ? 'set' : 'not set'}`,
    `  PUBLIC_CRMX_EMBED     ${crmxEmbed().length > 0 ? 'set' : 'not set'}`,
  ].join('\n'),
);
process.exit(1);
