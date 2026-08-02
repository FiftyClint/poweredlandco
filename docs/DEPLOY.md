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

**Tell me when you reach this point.** I publish the sites, and then you do
Part 3.

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
custom domain.

`npm run deploy -- --dry-run` prints the commands without running them, and
needs no credentials.
