import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Articles live as markdown in src/content/articles/<state>/<slug>.md, where
 * <state> is a site key ("ar", "ks") or "hub" for network wide pieces.
 *
 * The state directory is stripped from the public URL, so the same slug can
 * exist for several states. That is intentional: each state gets its own
 * article on its own domain, and the text must be different in each one.
 *
 * Nothing is published by flipping a switch in a build. `status` starts as
 * draft and only becomes published after Clint reviews the rendered page.
 */
const articles = defineCollection({
  loader: glob({ base: './src/content/articles', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    /** Site key this article belongs to, or "hub". */
    state: z.string().regex(/^[a-z]{2,4}$/),
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(300),

    /**
     * Every factual claim about incentives, utilities, regulation, or market
     * activity must trace to one of these. scripts/validate-content.mjs blocks
     * publication when a claim pattern appears with no sources listed.
     */
    sources: z
      .array(
        z.object({
          label: z.string().min(1),
          url: z.string().url(),
          accessed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        }),
      )
      .default([]),

    status: z.enum(['draft', 'published']).default('draft'),
    published: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
});

export const collections = { articles };
