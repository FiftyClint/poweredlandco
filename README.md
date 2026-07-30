# PoweredLandCo

Nineteen landowner lead sites from one codebase: a hub at `poweredlandco.com`
and eighteen `[state]datacenterland.com` sites.

## The two rules everything else follows from

**1. We are principals, not a brokerage.** We buy and option land with our own
money. The words broker, brokerage, realty, realtor, agent, listing, and "market
your property" must never appear in site copy, and this sentence must appear
verbatim in every footer and on every About page:

> PoweredLandCo is a principal buyer and site developer. We are not a licensed
> real estate brokerage and we do not represent sellers.

**2. No two sites may share body copy.** Nineteen domains built from one
codebase get discounted or deindexed if their main content reads as the same
document with the state name swapped. Shared layout is fine. Shared sentences
are not.

Both rules are enforced by scripts that fail the build. They are not left to
discipline, because with nineteen sites and a growing article library discipline
is not sufficient.

## Commands

```bash
npm install

npm run dev                  # hub site at localhost:4321
SITE=ar npm run dev          # a specific state site

npm run build:all            # every live site into dist/<key>/
npm run check                # copy, content and duplicate guards
npm run verify               # build, guards, accessibility and form, end to end
npm run audit:lighthouse     # mobile Lighthouse, run before a release

npm run generate-article -- --state ar --topic "How to sell your land ..."
```

## How the nineteen sites work

One Astro project, built once per site. `SITE=<key> astro build` reads
`src/data/sites/<key>.yaml`, sets the canonical domain, and writes to
`dist/<key>/`. Each build is a complete, self-contained static site for exactly
one domain, so the deploy target stays interchangeable.

There are three site types:

| Type | Pages | Which |
| --- | --- | --- |
| `hub` | Home, States, plus the shared pages | poweredlandco.com |
| `state` | Home, the state page, plus the shared pages | AR and KS live, 12 more to come |
| `parked` | One page | NY, GA, VA, IL |

`integrations/site-routes.mjs` injects only the routes a site's type needs, so a
parked state builds to exactly one page with no dead links and no phantom
sitemap entries. `src/pages/` holds only `404.astro`.

A site's `status` controls whether it builds. `live` sites build and deploy;
`pending` sites are domains we hold but have not launched, and `build:all` skips
them by name rather than silently. A state cannot be flipped to `live` until
every content field is written, because the schema requires them and the build
fails otherwise.

## Where content lives

**If it varies by state, it lives in `src/data/sites/<key>.yaml`.** Nothing is
hardcoded per state anywhere in a template. That includes the things it would be
tempting to share: the three trust points on the home page, the descriptions
under each How It Works step, and the copy under each qualifying criterion. Those
are persuasive editorial prose, and identical prose across fifteen domains is the
exact failure mode rule 2 exists to prevent.

Short labels are shared, in `src/data/process.mjs`. They behave like navigation
and no forty word passage can be built out of them.

Articles are markdown in `src/content/articles/<state>/<slug>.md`. `status:
draft` until Clint approves a rendered preview.

## The guards

| Script | Fails when |
| --- | --- |
| `lint-copy.mjs` | Banned vocabulary, an em dash, or an exclamation point appears in site copy, or a page is missing the positioning sentence. Scans rendered HTML and source YAML and markdown, so drafts are caught too. |
| `check-duplicate-copy.mjs` | Any forty word passage appears in `<main>` on two different sites. Uses rolling windows, not paragraph hashes, so a shared run buried inside two loosely rewritten paragraphs still trips it. |
| `validate-content.mjs` | A published article states a dollar amount, percentage, power figure, acreage, named program, or ranking claim with no source in its frontmatter. |
| `audit-a11y.mjs` | Any sanctioned accent fails WCAG AA contrast, or axe-core finds a violation on any built page. |
| `verify-form.mjs` | The intake form does not reach its webhook, does not confirm to the visitor, or loses a field. |

Two deliberate exemptions, both narrow:

- The positioning sentence is exempt from the vocabulary rule, because its job is
  to deny being a brokerage and it therefore contains the word.
- Subtrees marked `data-boilerplate` are skipped by the duplicate checker. This
  is the intake form, which is the same form everywhere and so has the same field
  labels everywhere. **Never put this attribute on prose to get copy past the
  checker.** If body text repeats across sites, write different text.

Privacy, terms and about are allowlisted in the duplicate checker. Identical
legal boilerplate across a network is expected and rewriting it per state to
satisfy a checker would be a bad trade.

## Design

One direction, "Extension Office": warm off-white `#FAF8F3`, deep forest green
`#2F5B45`, warm near-black ink, Source Sans 3 self-hosted. The reference is an
agricultural extension brochure or an agricultural lender, not a tech startup.

The audience is rural landowners, frequently older and frequently on a phone.
That is why body text starts at 19px, tap targets are oversized, there are no
accordions, and there is almost no JavaScript.

Sites may differ **only** in accent tone, chosen from the five in
`src/data/brand.mjs`. Every one is contrast-verified in both directions by
`audit-a11y.mjs`. Layout and components never vary.

## Lead capture

`FormSlot.astro` renders the CRMX embed once it exists, and until then renders
our own form, which posts to a Make.com webhook and works today. Both values live
at the top of `src/data/lead-capture.mjs` with instructions, and either can be
overridden by `PUBLIC_CRMX_EMBED` / `PUBLIC_LEAD_WEBHOOK` for previews.

The form is one screen. Only name, phone and email are required. "Not sure" is an
acceptable answer to every question that has one, and we never ask for a parcel
number or any other technical identifier.

**Destination.** Leads go to the Notion database "PoweredLandCo Landowner
Leads" under Business Operations Hub, and to a CRMX contact. A deploy-time
server function does both. The IDs and the full value mapping are recorded at
the top of `src/data/lead-capture.mjs` so it does not have to be rediscovered.

We are not embedding a CRMX or Notion form. Both are iframes running someone
else's code, which would take away control of type size, labels, tap targets
and the wording of every option, add third-party requests to pages that
currently score 100 on performance, and put accessibility outside our control.
GoHighLevel also has no create-form API at any permission level, so a CRMX form
could only ever be built by hand in their UI.

## Legal pages

**Privacy and terms have not been reviewed by an attorney.** That is a decision
Clint made deliberately, and it is written down here so nobody later assumes
otherwise.

They are therefore written conservatively: they describe only what the site
actually does, promise less rather than more, and give people more control over
their information than the minimum. The no-brokerage section in `terms.astro`
argues from facts rather than from status, since it is the facts that keep us
outside brokerage regulation in fourteen states: we buy for our own account, we
take no commission, and we perform no service for the landowner.

The form collects a phone number and we intend to call and text people, so the
consent language in `CONTACT_CONSENT` sits directly above the submit button
rather than being buried in a linked policy, and it is repeated in full in the
privacy policy.

`LEGAL_JURISDICTION` in `src/data/brand.mjs` is unset, so the terms carry no
governing law clause. Set it to the state PoweredLandCo is organized in and the
clause appears.

## Known TODOs

- Imagery is placeholder treatment only. No licensed photography yet, and no fake
  team photos, ever.
- Contact email is `info@poweredlandco.com` and the mailbox does not exist yet.
- Deployment target is undecided. Cloudflare now steers new projects to Workers
  static assets rather than Pages; per-site builds keep either option open.
