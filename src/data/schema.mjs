import { z } from 'astro/zod';
import { ACCENT_NAMES } from './brand.mjs';
import { PROCESS_STEPS, QUALIFY_CRITERIA } from './process.mjs';

/**
 * Schema for a site data file (src/data/sites/<key>.yaml).
 *
 * Every piece of content that varies between the 19 sites lives in one of these
 * files. Pages read from here and nowhere else. If a field is missing or
 * malformed the build fails loudly rather than rendering an empty section onto
 * a live domain.
 */

const nonEmpty = (label, max = 400) =>
  z.string().trim().min(1, `${label} cannot be empty`).max(max);

/** A short labelled block of prose. Used for steps, criteria and regions. */
const blurb = z.object({
  title: nonEmpty('blurb title', 120),
  body: nonEmpty('blurb body', 1200),
});

const faqEntry = z.object({
  question: nonEmpty('FAQ question', 300),
  answer: nonEmpty('FAQ answer', 2000),
});

/**
 * A cited source. Any factual claim about incentives, utilities or regulation
 * must point at one of these. See scripts/validate-content.mjs.
 */
const source = z.object({
  label: nonEmpty('source label', 200),
  url: z.string().url('source url must be a full URL'),
  accessed: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'source accessed date must be YYYY-MM-DD'),
});

/**
 * An optional photograph.
 *
 * Every image slot in the system is optional and renders nothing when unset.
 * The sites ship with no photography today by decision, so these exist purely
 * so that adding pictures later is a data file change rather than a redesign.
 */
const image = z.object({
  src: nonEmpty('image src', 300),
  alt: nonEmpty('image alt text', 300),
  credit: nonEmpty('image credit', 200).optional(),
});

const images = z
  .object({
    /** Shown when the site is shared in a text message or on social. */
    og: image.optional(),
    /** Full width band between sections on the home page. */
    banner: image.optional(),
  })
  .default({});

const utility = z.object({
  name: nonEmpty('utility name', 200),
  kind: z.enum(['investor-owned', 'cooperative', 'municipal', 'generation']),
  note: nonEmpty('utility note', 400).optional(),
});

/**
 * Prose for the two pages that are structurally the same everywhere: How It
 * Works and What Makes Land Qualify.
 *
 * The step and criterion labels are shared (see process.mjs). Everything with
 * enough words to matter is written per site, because the same paragraphs on 18
 * domains is the duplicate-content failure this whole network has to avoid.
 * The array lengths are pinned to the shared label lists so adding a step
 * without writing the copy for it fails the build instead of rendering a
 * heading with nothing under it.
 */
const pageCopySchema = z.object({
  howItWorks: z.object({
    intro: nonEmpty('how it works intro', 1200),
    steps: z
      .array(nonEmpty('step body', 800))
      .length(PROCESS_STEPS.length, `provide exactly ${PROCESS_STEPS.length} step descriptions`),
    closing: nonEmpty('how it works closing', 1200),
  }),
  /**
   * The articles index. Needed per site because until articles are published
   * this page is nothing but its own introduction and an empty state, and two
   * sites carrying the same two paragraphs is a duplicate document.
   */
  articles: z.object({
    intro: nonEmpty('articles intro', 800),
    empty: nonEmpty('articles empty state', 800),
  }),
  qualify: z.object({
    intro: nonEmpty('qualify intro', 1200),
    criteria: z
      .array(nonEmpty('criterion body', 800))
      .length(
        QUALIFY_CRITERIA.length,
        `provide exactly ${QUALIFY_CRITERIA.length} criterion descriptions`,
      ),
    closing: nonEmpty('qualify closing', 1200),
  }),
});

/**
 * The three trust points on the home page.
 *
 * These are per site rather than shared because they are persuasive editorial
 * copy, and three identical paragraphs across 15 domains is the sort of
 * duplication that gets a network discounted. Form labels and navigation are
 * allowed to repeat. Arguments for why a landowner should trust us are not.
 */
const trustPoints = z
  .array(blurb)
  .length(3, 'provide exactly three trust points');

/** Content required before a state site can go live. */
const stateContent = z.object({
  hero: z.object({
    headline: nonEmpty('hero headline', 160),
    subhead: nonEmpty('hero subhead', 400),
  }),

  /**
   * Answers "how do I sell my land for a data center in [State]" directly.
   * Rendered as the opening of the state page, which is why it is length
   * checked: the answer has to land inside the first 150 words.
   */
  directAnswer: nonEmpty('direct answer', 1200),

  trustPoints,

  /**
   * What the land might be worth and why. This is the first question every
   * landowner asks, so it gets its own section high on the page.
   *
   * It explains how value is arrived at. It never states a price. We do not
   * publish figures we would have to invent, and a number quoted before anyone
   * has looked at a specific property is not a real number anyway.
   */
  value: z.object({
    intro: nonEmpty('value intro', 1200),
    points: z.array(blurb).min(3).max(4),
  }),

  /**
   * Living with it. Whether the ground stays usable, what a build actually does
   * to the place, and how the neighbors take it.
   *
   * These are the questions asked at the kitchen table rather than in a
   * boardroom, and the first version of these sites did not answer them.
   */
  livingWithIt: z.array(blurb).min(3).max(4),

  /** Why the serving utility matters here. Differs by state more than it looks. */
  utilitiesNote: nonEmpty('utilities note', 900),

  utilities: z.array(utility).min(1, 'list at least one utility'),

  incentives: z.object({
    summary: nonEmpty('incentive summary', 2000),
    sources: z.array(source).min(1, 'incentive summary needs at least one source'),
  }),

  regions: z.array(blurb).min(1, 'list at least one region'),

  faq: z.array(faqEntry).min(3, 'a state site needs at least three FAQ entries'),

  pageCopy: pageCopySchema,
});

const base = z.object({
  key: z
    .string()
    .regex(/^[a-z]{2,4}$/, 'key must be 2-4 lowercase letters'),
  domain: z
    .string()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'domain must be a bare hostname'),
  accent: z.enum(ACCENT_NAMES),
  /**
   * `live` sites are built and deployed. `pending` sites are known domains we
   * have not launched yet: their data file exists so the inventory is visible
   * in the repo, but build:all skips them and they are held to a lighter
   * schema until the content is written.
   */
  status: z.enum(['live', 'pending']),
  images,
});

const hubSite = base.extend({
  type: z.literal('hub'),
  hero: z.object({
    headline: nonEmpty('hero headline', 160),
    subhead: nonEmpty('hero subhead', 400),
  }),
  faq: z.array(faqEntry).min(3, 'the hub needs at least three FAQ entries'),
  trustPoints,
  pageCopy: pageCopySchema,
});

const parkedSite = base.extend({
  type: z.literal('parked'),
  stateName: nonEmpty('state name', 60),
  stateAbbr: z.string().regex(/^[A-Z]{2}$/, 'stateAbbr must be two capitals'),
  /**
   * Written per state. Four placeholder pages carrying the same two paragraphs
   * would be four near-duplicate documents, so each one says something of its
   * own even though the page is small.
   */
  intro: nonEmpty('parked intro', 900),
});

const stateSite = base
  .extend({
    type: z.literal('state'),
    stateName: nonEmpty('state name', 60),
    stateAbbr: z.string().regex(/^[A-Z]{2}$/, 'stateAbbr must be two capitals'),
  })
  .merge(stateContent.partial());

/**
 * Discriminated on `type` so a bad field in a state file reports that field,
 * rather than the three-way "no union member matched" wall of text.
 */
export const siteSchema = z
  .discriminatedUnion('type', [hubSite, parkedSite, stateSite])
  .superRefine((value, ctx) => {
    // A pending state may be a stub. A live one may not: it is about to be
    // served on its own domain, so every content field has to be present.
    if (value.type !== 'state' || value.status !== 'live') return;
    const result = stateContent.safeParse(value);
    if (result.success) return;
    for (const issue of result.error.issues) {
      ctx.addIssue({
        ...issue,
        message: `${issue.message} (required once status is "live")`,
      });
    }
  });

export { source as sourceSchema };
