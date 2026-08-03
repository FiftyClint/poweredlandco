import { buildNotionPage } from './lead-to-notion.mjs';

/**
 * The Worker that fronts every site in the network.
 *
 * Cloudflare serves the built files directly and only calls this script for
 * paths under /api/, which is configured by run_worker_first in the generated
 * wrangler config. So a landowner reading a page never touches this code at
 * all; the pages stay as static as they were before. The only request that
 * reaches here is a form submission.
 *
 * Why the receiver lives on the site's own domain rather than a separate one:
 *   - The form posts to /api/lead, a relative path, so the same built HTML is
 *     correct on all nineteen domains with nothing to configure per site.
 *   - Same origin means no CORS, no preflight, and nothing to get wrong when a
 *     new domain is added.
 *   - The Notion token is a Worker secret. It is never in the built files and
 *     never reaches a browser.
 */

const NOTION_API = 'https://api.notion.com/v1/pages';

/*
 * Pinned deliberately. Notion keeps old API versions working indefinitely and
 * breaks behaviour between them, so an unpinned version is a site that stops
 * accepting leads on a date nobody chose. 2022-06-28 takes a database_id
 * parent, which is what DATABASE_ID below is.
 *
 * If this ever needs to move to the 2025-09-03 line, the parent changes to
 * { type: 'data_source_id', data_source_id: 'e12b4776-22db-4dca-9390-cc0b0a58a620' }
 * and nothing else in this file has to change.
 */
const NOTION_VERSION = '2022-06-28';

/** Notion database "PoweredLandCo Landowner Leads", under Business Operations Hub. */
const DATABASE_ID = 'b892f146-ee8d-4e30-b56f-17b8f727f6b0';

/*
 * A person cannot read the questions, type a name, a phone number and an email
 * address, and submit in under three seconds. A script can. Tripping this does
 * not discard the submission, it only ticks Spam signal, because a password
 * manager filling three fields at once is rare but real and no landowner should
 * disappear because of it.
 */
const MIN_FILL_MS = 3000;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/lead') return receiveLead(request, env);

    /*
     * Anything else under /api/ is not ours. Answering 404 here rather than
     * falling through to the asset handler keeps a typo in the form action
     * from quietly rendering the 404 page and looking like a success.
     */
    if (url.pathname.startsWith('/api/')) return json(404, { error: 'Not found' });

    return env.ASSETS.fetch(request);
  },
};

async function receiveLead(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
  }

  /*
   * No token means no destination. Returning an error is the point: the form
   * script shows "that did not go through, please try once more or email us"
   * rather than thanking somebody whose details went nowhere. That exact false
   * thank you is the bug this whole path exists to make impossible.
   */
  if (!env.NOTION_TOKEN) {
    console.error('lead: NOTION_TOKEN is not set on this Worker');
    return json(503, { error: 'Lead capture is not configured' });
  }

  let form;
  try {
    form = await request.formData();
  } catch (error) {
    return json(400, { error: 'Could not read the submission' });
  }

  const fields = {};
  for (const key of new Set([...form.keys()])) {
    const values = form.getAll(key).map((v) => (typeof v === 'string' ? v : ''));
    fields[key] = values.length > 1 ? values : values[0];
  }

  const fromScript = fields.client === 'script';

  /* Nobody should be able to create an empty row by posting to this address. */
  const hasContact = ['name', 'phone', 'email'].some((k) => (fields[k] || '').trim().length > 0);
  if (!hasContact) return json(400, { error: 'Nothing to record' });

  const spam = isSpam(fields);

  const body = buildNotionPage(fields, DATABASE_ID, { spam });

  let response;
  try {
    response = await fetch(NOTION_API, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.NOTION_TOKEN}`,
        'notion-version': NOTION_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error('lead: could not reach Notion', error);
    return json(502, { error: 'Could not save the submission' });
  }

  if (!response.ok) {
    /*
     * Logged in full so `npx wrangler tail poweredlandco-<key>` shows exactly
     * which property Notion objected to. Not returned to the browser, because
     * the visitor can do nothing with it and it would expose the schema.
     */
    const detail = await response.text().catch(() => '');
    console.error(`lead: Notion rejected the write (${response.status})`, detail);
    return json(502, { error: 'Could not save the submission' });
  }

  /*
   * With JavaScript off the browser posts natively and follows the response, so
   * it gets a real page. The script sets client=script and gets JSON.
   */
  if (!fromScript) {
    const redirect = typeof fields.redirect_to === 'string' ? fields.redirect_to : '/thank-you';
    /* Only ever our own paths. An absolute URL here would be an open redirect. */
    const safe = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/thank-you';
    return new Response(null, { status: 303, headers: { location: safe } });
  }

  return json(200, { ok: true });
}

/**
 * Two cheap signals, neither of which discards anything on its own.
 *
 * The honeypot is a text field sitting off screen that a person never sees. The
 * timing check compares the moment the page rendered against the moment it was
 * submitted.
 */
function isSpam(fields) {
  if ((fields.website || '').trim().length > 0) return true;

  const loadedAt = Number(fields.form_loaded_at);
  if (!Number.isFinite(loadedAt) || loadedAt <= 0) return false;

  const elapsed = Date.now() - loadedAt;
  /* A negative gap means the visitor's clock is ahead of ours, not a bot. */
  return elapsed >= 0 && elapsed < MIN_FILL_MS;
}
