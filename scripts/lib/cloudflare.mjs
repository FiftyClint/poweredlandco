/**
 * The smallest useful wrapper around the Cloudflare API.
 *
 * Only the handful of calls needed to take a domain from "registered at
 * GoDaddy" to "serving our site", so that job stops being nineteen rounds of
 * clicking through a dashboard that gets rearranged every few months.
 *
 * Every call returns the `result` field or throws with Cloudflare's own error
 * text. Cloudflare answers 200 with `success: false` for some failures, so the
 * status code alone is not enough to go on.
 */

const API = 'https://api.cloudflare.com/client/v4';

class CloudflareError extends Error {
  constructor(message, { status, errors = [] } = {}) {
    super(message);
    this.name = 'CloudflareError';
    this.status = status;
    this.errors = errors;
  }
}

/**
 * The domain token, which is a different credential from the deploy token.
 *
 * Cloudflare's token editor allows one resource scope per token: either the
 * whole account or all domains, not both. Publishing a Worker needs the
 * account scope and managing a zone needs the domain scope, so one token cannot
 * do both jobs.
 *
 * Two tokens is the better shape regardless. The deploy token cannot touch DNS,
 * and this one cannot publish anything, so a mistake with either has a bounded
 * blast radius and publishing can never be taken down by domain work.
 */
const token = () => {
  const value = (process.env.CLOUDFLARE_ZONE_TOKEN ?? '').trim();
  if (!value) {
    throw new Error(
      'CLOUDFLARE_ZONE_TOKEN is not set. It is a separate token from ' +
        'CLOUDFLARE_API_TOKEN, scoped to All Domains. See docs/DEPLOY.md Part 6.',
    );
  }
  return value;
};

export const accountId = () => {
  const value = (process.env.CLOUDFLARE_ACCOUNT_ID ?? '').trim();
  if (!value) throw new Error('CLOUDFLARE_ACCOUNT_ID is not set.');
  return value;
};

async function call(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token()}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new CloudflareError(`${method} ${path} returned ${response.status} and no JSON`, {
      status: response.status,
    });
  }

  if (!response.ok || payload.success === false) {
    const errors = payload.errors ?? [];
    const detail = errors.map((e) => `${e.code} ${e.message}`).join('; ') || response.statusText;
    throw new CloudflareError(`${method} ${path}: ${detail}`, {
      status: response.status,
      errors,
    });
  }

  return payload.result;
}

/**
 * The zone for a domain, or null if Cloudflare does not have it yet.
 *
 * `status` is the field that matters. It reads "pending" until the registrar's
 * nameservers actually point here, and "active" once they do. Nothing can be
 * attached to a domain before then.
 */
export async function findZone(domain) {
  const zones = await call('GET', `/zones?name=${encodeURIComponent(domain)}`);
  return zones[0] ?? null;
}

export async function createZone(domain) {
  return call('POST', '/zones', {
    name: domain,
    account: { id: accountId() },
    type: 'full',
  });
}

export async function listDnsRecords(zoneId) {
  return call('GET', `/zones/${zoneId}/dns_records?per_page=100`);
}

export async function deleteDnsRecord(zoneId, recordId) {
  return call('DELETE', `/zones/${zoneId}/dns_records/${recordId}`);
}

/**
 * The address a proxied record points at when nothing is really there.
 *
 * 100:: is the IPv6 discard prefix. Cloudflare needs a record to exist before it
 * will accept traffic for a hostname, but with a Worker route in front nothing
 * ever reaches the address. This is the same record Cloudflare creates for
 * itself when a Worker custom domain is attached, which is deliberate: it means
 * hostnames we wire up and hostnames the dashboard wired up look identical, and
 * the guard in setup-zones protects both from deletion.
 */
export const PROXY_TARGET = '100::';

export async function createProxiedRecord(zoneId, name) {
  return call('POST', `/zones/${zoneId}/dns_records`, {
    type: 'AAAA',
    name,
    content: PROXY_TARGET,
    proxied: true,
    comment: 'Points at the PoweredLandCo Worker. Managed by scripts/setup-zones.mjs.',
  });
}

export async function listWorkerRoutes(zoneId) {
  return call('GET', `/zones/${zoneId}/workers/routes`);
}

/**
 * Sends a hostname to a Worker.
 *
 * A route rather than a custom domain, because a route is a zone level thing
 * and a custom domain is an account level one. Cloudflare allows a token to
 * hold either account scope or domain scope, never both, so the account scoped
 * token that publishes the Workers cannot attach a domain and this one can.
 * The result a visitor sees is the same.
 */
export async function createWorkerRoute(zoneId, pattern, script) {
  return call('POST', `/zones/${zoneId}/workers/routes`, { pattern, script });
}

export { CloudflareError };
