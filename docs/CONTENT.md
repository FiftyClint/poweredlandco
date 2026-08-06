# Keeping the sites current, and finding out whether it works

Three things live here: how to see whether anyone is finding these sites, how an
article gets from an idea to a live page, and what keeps the facts from going
stale underneath us.

---

## Part 1. Google Search Console

Do this before anything else. Right now nobody can see which searches reach
these sites, which pages are indexed, or whether the four published articles
landed at all. Every decision about what to write next is a guess until this
exists.

It is free and it takes about ten minutes for the first domain.

### Set up the first property

1. Go to **search.google.com/search-console**
2. Sign in with the Google account you want to own this. Use a business account
   rather than a personal one if you have the choice, because it is awkward to
   move later.
3. You will be asked to choose a property type. Pick **Domain** on the left, not
   URL prefix. A domain property covers `www` and non `www` together, which
   matters because both now work.
4. Type `poweredlandco.com` and click **Continue**.
5. Google shows you a **TXT record** to add to your DNS. It looks like
   `google-site-verification=` followed by a long string. Copy the whole thing.
6. Send me that string and I will add it to Cloudflare, or add it yourself:
   **dash.cloudflare.com**, click the domain, **DNS**, **Add record**, type
   **TXT**, name `@`, and paste into the content field.
7. Back in Search Console, click **Verify**. If it fails, wait five minutes and
   try again. DNS is rarely instant.

### Then the rest

Repeat for each domain you care about. `arkansasdatacenterland.com`,
`kansasdatacenterland.com`, `virginiadatacenterland.com` and
`texasdatacenterland.com` are the four with real content, so they are the ones
worth doing next. The other fourteen can wait until they are full sites.

Google gives a different verification string per domain, so there is no way to
do this in one action. If you collect all of them and send them to me, I can add
every TXT record in one run rather than you doing nineteen visits to the DNS
page.

### What to look at, and when

Nothing for the first couple of weeks. New domains take time to be crawled at
all.

After that, the number worth watching is **impressions**, not clicks.
Impressions mean Google is showing you to somebody, which happens long before
anyone clicks. A page going from zero to a few dozen impressions is the first
real evidence that the thesis works. Clicks follow much later.

The other thing worth reading is the **Queries** list, because it tells you what
people actually type, which is reliably different from what we assumed they
type. That list is what the next batch of articles should be written against.

---

## Part 2. How an article gets published

Nothing is published automatically and nothing should be.

1. `npm run generate-article -- --state ar --topic "..."` scaffolds a draft with
   valid frontmatter and an outline. It deliberately does not write prose.
2. The prose is written in a session where sources can actually be looked up.
   Any claim about an incentive, a utility or a rule needs a real URL in
   `sources`, or `validate-content` blocks it.
3. The draft renders on the site only once `status` becomes `published` and a
   `published` date is set. That change is Clint's call, made against a rendered
   page rather than a diff.
4. The guards run on every push regardless: banned vocabulary, the positioning
   sentence, unsourced claim patterns, and no shared 40-word passage across any
   two domains.

### Publish a few at a time

Eleven articles exist and four are live. That is deliberate. A site that
publishes its entire library in an afternoon and then goes quiet for three
months reads as abandoned, and steady publishing is itself a signal worth
having. The remaining seven are a cadence, not a backlog.

---

## Part 3. Keeping the facts from rotting

These pages assert things: investment thresholds, job counts, sunset dates,
which utility serves where. Those assertions are only worth anything because
they carry a citation, and citations die quietly when a state redesigns its
website.

### The source checker

`npm run check:sources` follows every URL cited anywhere in the repo, both in
the state data files and in article frontmatter, and reports what no longer
resolves. Add `-- --watch` to check the monitoring lists too.

It runs weekly in GitHub Actions under the **Sources** workflow, and can be run
by hand from the Actions tab.

It fails only on 404 and 410. A timeout or a server error is reported and
forgiven, because a check that goes red for reasons nobody can act on is a check
everybody learns to ignore.

**It is deliberately not part of the deploy.** These sites cite state
legislatures and utility commissions. If the checker gated deployment, any one
of those having a bad afternoon would stop this network publishing. Nobody
else's uptime gets to block ours.

### The watchlist

Each full state site carries a `watch` list in its data file: the legislature,
the regulator, the economic development agency, the main utility, and a news
source for that state. It renders nowhere. It is working knowledge about where
that state's facts actually move.

It is per state rather than one shared list because the difficulty of keeping
nineteen sites current is that each one changes for its own reasons. Arkansas
changed because Act 548 cut a threshold. Texas changed because Senate Bill 6
altered how large loads connect. Neither would have been found by watching the
other.

### What a content engine can and cannot do

The tempting version of this is a scheduled job that researches, writes and
publishes without anyone reading it. That would be the fastest way to lose the
whole network. Nineteen domains in one niche publishing generated content on a
schedule is the pattern search engines exist to catch, and it fails all nineteen
at once because they share ownership, hosting, structure and topic.

There is also the legal edge. These pages make claims about tax exemptions and
land transactions. A generator that invents an incentive program is not a typo.

The bottleneck was never the writing. It is knowing what to write about, and
that is what the watchlist and the source checker are for. A research pass that
comes back with "Arkansas amended its threshold, here is the statute" turns a
three hour job into a twenty minute one, and a person still decides whether it
goes live.
