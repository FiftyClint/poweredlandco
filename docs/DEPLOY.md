# Putting the sites online

Written for Clint. One action per line. Nothing here costs money.

**Before you start, two reassurances.**

You are **not** moving your domains away from GoDaddy. GoDaddy stays the
registrar, still owns the domains, still renews them, still takes your money for
them. All that changes is which company answers the question "where does this
website live." That is a setting inside GoDaddy that you can change back.

Nothing in these steps charges a card. Cloudflare asks for one during signup on
some flows. If it does, you can skip it, and if you cannot skip it, stop and
tell me rather than entering one.

---

## Part 1. Create the Cloudflare account

About five minutes.

1. Go to **dash.cloudflare.com/sign-up**
2. Type your email address and a password.
3. Click **Sign up**.
4. Open your email and click the verification link Cloudflare sends.
5. You should now be looking at a mostly empty dashboard.

Stop here if anything asked for payment. Tell me what you saw.

---

## Part 2. Give GitHub permission to publish

About five minutes. This lets the sites publish themselves whenever the content
changes, so you never have to do it by hand.

### Get the token

1. In Cloudflare, click your **profile icon** in the top right.
2. Click **My Profile**.
3. Click **API Tokens** in the left menu.
4. Click **Create Token**.
5. Find the template called **Edit Cloudflare Workers** and click **Use template**
   next to it.
6. Scroll to the bottom and click **Continue to summary**.
7. Click **Create Token**.
8. You will see a long string of letters and numbers. **Copy it now.** Cloudflare
   will not show it again. If you lose it, delete the token and make another.

### Get the account number

1. Click **Workers & Pages** in the left menu.
2. Look at the right hand side of the page for **Account ID**.
3. Copy that too.

### Put both into GitHub

1. Go to **github.com/FiftyClint/poweredlandco**
2. Click **Settings** along the top of the page.
3. In the left menu click **Secrets and variables**, then **Actions**.
4. Click the green **New repository secret** button.
5. In **Name** type exactly: `CLOUDFLARE_API_TOKEN`
6. In **Secret** paste the long token from step 8 above.
7. Click **Add secret**.
8. Click **New repository secret** again.
9. In **Name** type exactly: `CLOUDFLARE_ACCOUNT_ID`
10. In **Secret** paste the Account ID.
11. Click **Add secret**.

You should now see two secrets listed. You cannot read them back, which is
correct and means they are stored properly.

### The Notion secret, which is where leads land

Done on 2026-08-03. Recorded here because it is the piece that makes the form
worth having, and because it will need doing again if the token is ever
replaced.

A third repository secret named `NOTION_TOKEN` holds the access token for the
Notion connection called **PoweredLandCo Leads**, created in the **CGF**
workspace and given access to the **PoweredLandCo Landowner Leads** database.
It has permission to read and to add rows, and nothing else. If it ever needs
replacing, make a new connection at `notion.so/my-integrations`, connect it to
that database, and update the secret. Nothing in the code changes.

Three things are worth knowing about it:

- The token is never in a page anybody downloads. GitHub hands it to
  Cloudflare, Cloudflare stores it against each Worker, and the Worker reads it
  when a form is submitted. `npm run check:secrets` scans every built file for
  it before anything is uploaded and stops the deploy if it finds it.
- Without it, the sites still publish, but the form is replaced by an email
  address. That is deliberate. A form with nowhere to send a submission would
  thank a landowner for details that went nowhere.
- The connection must be attached to the database itself, not only created.
  A token that exists but has not been connected fails with a confusing
  "not found" rather than a permissions error.

**Tell me when you reach this point.** I publish the sites, and then you do
Part 3.

### The workers.dev subdomain

A brand new Cloudflare account has no `workers.dev` subdomain, and nothing can
publish until one exists. This account's is **clint-bfa.workers.dev**, set on
2026-08-02.

That gives every site a temporary address, for example
`poweredlandco-ar.clint-bfa.workers.dev`, which is how a deploy gets checked
before any DNS is touched. Those addresses keep working after the real domains
are attached and are handy for confirming a change reached production.

Do **not** use the "Create application" or "Set up your application" flow in the
Cloudflare dashboard. It connects the repository and has Cloudflare run the
build, which skips the content guards and only ever builds one site rather than
the full set. Publishing happens from GitHub Actions.

---

## Part 3. Point one domain at Cloudflare

We do **arkansasdatacenterland.com** first, on its own, and confirm it works
before touching the other eighteen. If something is wrong, it is wrong on one
domain instead of nineteen.

Budget ten minutes of clicking and then some waiting.

### Add the domain to Cloudflare

1. In Cloudflare click **Websites** in the left menu.
2. Click **Add a site** or **Add a domain**.
3. Type `arkansasdatacenterland.com`
4. Click **Continue**.
5. When asked to choose a plan, select **Free**. It is at the bottom of the list
   and it is easy to miss.
6. Click **Continue**.
7. Cloudflare will look at the domain's existing records. Let it finish and click
   **Continue**.
8. You will now see **two nameservers**. They look something like
   `alice.ns.cloudflare.com` and `bob.ns.cloudflare.com`, with different names.
   **Leave this page open.** You need to type these into GoDaddy next.

### Change the nameservers at GoDaddy

1. Open a new browser tab and go to **godaddy.com**, then sign in.
2. Click your name in the top right, then **My Products**.
3. Find **arkansasdatacenterland.com** in the list.
4. Click **DNS** next to it.
5. Look for a section called **Nameservers**. It is usually near the bottom.
6. Click **Change** or **Change Nameservers**.
7. Choose **I'll use my own nameservers** (the wording may be "Custom").
8. Delete whatever is in the two boxes.
9. Type the two Cloudflare nameservers from the step above, one in each box.
10. Click **Save**.
11. GoDaddy may warn you that this will change where your site is hosted. That is
    exactly what we want. Confirm it.

### Wait

1. Go back to the Cloudflare tab and click **Continue** or **Check nameservers**.
2. Cloudflare now waits for the change to take effect. This usually takes under
   an hour and can occasionally take longer.
3. Cloudflare emails you when it is done. You do not need to sit and watch it.

---

## Part 4. Connect the domain to the site

Do this after Cloudflare emails to say the domain is active.

1. In Cloudflare click **Workers & Pages** in the left menu.
2. Click **poweredlandco-ar** in the list.
3. Click **Settings**.
4. Find **Domains & Routes** and click **Add**.
5. Choose **Custom domain**.
6. Type `arkansasdatacenterland.com`
7. Click **Add domain**.
8. Cloudflare sets up the security certificate on its own. Give it a few minutes.

Then repeat steps 4 to 7 once more, typing `www.arkansasdatacenterland.com`, so
the address works whether or not somebody types www.

---

## Part 5. Confirm it actually works

1. Open a new tab and go to **arkansasdatacenterland.com**
2. You should see the Arkansas site, with a padlock next to the address.
3. Open it on your phone as well. That is how most landowners will see it.
4. Fill the form in yourself with real details and send it.

That last one matters. **Tell me when you have submitted it and I will confirm
the lead arrived** in the Notion database. If it did not, I would much rather
find that out from your test than from a landowner who gave up.

What you should see when you send it:

- The page stays where it is and a green message appears saying we have your
  information.
- A new row appears in **PoweredLandCo Landowner Leads**, in the **New leads**
  view, within a second or two.

If instead you get "That did not go through", the site is telling you the truth
and the lead was not saved. Send me a screenshot rather than trying repeatedly.
The message only ever appears when the save actually failed, so it is worth
acting on.

---

## Part 6. The other eighteen

Only after Arkansas is confirmed working end to end.

Repeat Part 3 and Part 4 for each remaining domain. The Worker name matches the
state, so `kansasdatacenterland.com` connects to `poweredlandco-ks`, and
`poweredlandco.com` connects to `poweredlandco-hub`.

Right now the ones ready to connect are:

| Domain | Worker |
| --- | --- |
| poweredlandco.com | poweredlandco-hub |
| arkansasdatacenterland.com | poweredlandco-ar |
| kansasdatacenterland.com | poweredlandco-ks |
| georgiadatacenterland.com | poweredlandco-ga |
| illinoisdatacenterland.com | poweredlandco-il |
| newyorkdatacenterland.com | poweredlandco-ny |
| virginiadatacenterland.com | poweredlandco-va |

The other twelve get connected as their sites are built.

---

## If a screen does not match

Cloudflare rearranges its dashboard fairly often, so a button may sit somewhere
other than where this says. The steps describe what you are trying to achieve,
not just where to click. If a label is different, take a screenshot and send it
to me rather than guessing.

---

## Notes for whoever maintains this

Deployment runs from `.github/workflows/deploy.yml` on pushes to the default
branch, after the content guards pass. Cloudflare receives finished files and
never builds anything, which keeps build minutes out of the picture and stops
anyone bypassing the duplicate-copy and vocabulary checks.

`scripts/deploy.mjs` deploys one Worker per live site. Worker names are derived
from the site key and must stay stable, because renaming one detaches its
custom domain. It writes a throwaway `wrangler.generated.jsonc` per site rather
than passing flags, because `run_worker_first` and `not_found_handling` have no
command line equivalent.

`npm run deploy -- --dry-run` prints the commands without running them, and
needs no credentials.

### How a lead actually gets from the form into Notion

Each Worker carries `workers/site/index.mjs` alongside the built files.
Cloudflare serves the pages straight from disk and only wakes that script for
paths under `/api/`, so a visitor reading a page never runs any of it. A form
post to `/api/lead` is the only request that reaches it.

The receiver lives on each site's own domain rather than on one shared address,
which is why the form action is the relative path `/api/lead`. One built page is
then correct on all nineteen domains, there is no cross-origin request to
configure, and nothing has to be remembered when a new state goes live.

`workers/site/lead-to-notion.mjs` maps form values onto the database schema. Two
rules in there are load bearing:

- **It never sets Screening.** The New leads view shows rows whose Screening is
  empty, so writing a value would hide every new lead from the only view anyone
  looks at.
- **An unrecognised answer never costs the lead.** Notion rejects the entire
  page if a select value is not already an option, which would throw away the
  name and phone number along with it. Anything that cannot be mapped
  confidently goes into Notes as plain text instead.

The honeypot and the submission-timing trap tick the **Spam signal** checkbox
rather than discarding anything, and the New leads view filters those out. A
password manager filling three fields at once is rare but real, and no landowner
should vanish because of it.

Two scripts guard this and both gate the deploy:

- `npm run verify:receiver` runs the Worker in plain Node against a stubbed
  Notion. It covers the cases where being wrong is expensive: a failed save
  reported as a thank you, a lead lost to a validation error, Screening
  accidentally set, an open redirect through `redirect_to`.
- `npm run verify:form` drives a real browser through the built page and
  asserts, among other things, that a 502 from the receiver produces an error
  message rather than a confirmation.

If leads stop arriving, `npx wrangler tail poweredlandco-ar` shows exactly what
Notion objected to. The Worker logs the rejection in full and returns only a
generic failure to the browser.
