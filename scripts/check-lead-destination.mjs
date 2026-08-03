#!/usr/bin/env node
import { hasLeadDestination, crmxEmbed, leadWebhook } from '../src/data/lead-capture.mjs';

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
  const via = crmxEmbed() ? 'CRMX embed' : 'webhook';
  console.log(`Lead destination check passed. Submissions go to the ${via}.`);
  process.exit(0);
}

console.error(
  [
    'Lead destination check FAILED.',
    '',
    'No CRMX embed and no webhook are configured, so nothing would receive a',
    'form submission. Deploying in this state would put a lead capture site',
    'online with no lead capture.',
    '',
    'The sites are still usable meanwhile: FormSlot shows an email address',
    'rather than a form, so a landowner reaches a real person instead of a',
    'thank you message that is not true.',
    '',
    'To fix, set one of these:',
    '  PUBLIC_LEAD_WEBHOOK   an address that accepts the submission',
    '  PUBLIC_CRMX_EMBED     the embed code from a CRMX form',
    '',
    'or fill in the matching constant at the top of src/data/lead-capture.mjs.',
    '',
    `Currently: crmxEmbed=${crmxEmbed().length} chars, leadWebhook=${leadWebhook().length} chars.`,
  ].join('\n'),
);
process.exit(1);
