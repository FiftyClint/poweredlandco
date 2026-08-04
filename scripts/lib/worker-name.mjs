/**
 * The Cloudflare Worker name for a site.
 *
 * Shared by the deploy script, which creates the Worker, and the domain script,
 * which points hostnames at it. If those two ever disagreed, a domain would
 * route to a Worker that does not exist and the site would answer with an error
 * while every check reported success. One definition removes the possibility.
 *
 * Names must stay stable. Renaming a Worker detaches every domain pointing at
 * it, which is a silent outage rather than a failed deploy.
 */
export const workerName = (site) => `poweredlandco-${site.key}`;
