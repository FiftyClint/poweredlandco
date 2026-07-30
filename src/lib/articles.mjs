import { getCollection } from 'astro:content';

/**
 * Article helpers shared by the index and the detail page.
 *
 * Drafts never appear in a build. That is the publishing gate: an article is
 * visible only once its frontmatter says published, which happens after Clint
 * reviews the rendered page.
 */

/** Public URL slug for an entry. Strips the leading state directory. */
export const articleSlug = (entry) => entry.id.split('/').slice(1).join('/') || entry.id;

export const articlePath = (entry) => `/articles/${articleSlug(entry)}`;

/** Published articles belonging to this site, newest first. */
export async function articlesFor(site) {
  const all = await getCollection('articles', ({ data }) => data.status === 'published');
  return all
    .filter((entry) => entry.data.state === site.key)
    .sort((a, b) => (b.data.published || '').localeCompare(a.data.published || ''));
}
