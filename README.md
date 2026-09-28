# TEKNIK — website

Static site for Netlify. No build step, no dependencies, no database.
Two free tools run on Netlify Functions; everything else is plain HTML/CSS.

---

## Deploying

**Drag and drop.** Select the *contents* of this folder — `index.html`,
`assets/`, `privacy/`, and the rest — and drag those onto the Netlify
deploys page. Do not drag the enclosing folder; Netlify would publish it
one level down and nothing would resolve.

A drag deploy **replaces the whole site**. Whatever you drop is what the
site becomes. That is how the homepage disappeared last time — a folder
with no `index.html` was dropped, so there was no homepage left to serve.
Everything needed is in here, so dropping this set is safe.

**Or connect Git**, which is better once you're iterating and removes the
all-or-nothing risk entirely:

```
git init && git add . && git commit -m "TEKNIK site"
```

Push to GitHub, connect the repo in Netlify. Build command: none.
Publish directory: `.`

After the first deploy, go to Netlify -> Forms and confirm the `contact`
form appears, then add a notification email so submissions reach someone.
Netlify only registers forms at deploy time, so this cannot be done first.

---

## One thing still to fill in

**Client portal.** The four portal links point at `#contact`, so none of
them are dead, but they do not yet go anywhere useful.

`flexpoint.com` is not the right address. The vendor is `getflexpoint.com`,
and their marketing site is not where a client should land when trying to
pay an invoice. FlexPoint issues each MSP a **white-label portal on your
own branding**, with passwordless login and Microsoft SSO. That branded
URL is the one that belongs here.

To find it: log into your FlexPoint admin portal and look under the
branded / client portal settings, or open any invoice email you have
already sent a client and copy the domain from the payment link.

Then search `index.html` for `Client portal: swap #contact` — four
occurrences — and replace `#contact` with the real URL.

**Now filled in and live:** business hours (Mon-Fri, 8am-5pm ET),
onboarding duration (two to three weeks), assessment duration (60
minutes). The opening hours are also published in the JSON-LD, so Google
can surface them in a business panel.

**Partner logos.** The partner grid uses vendor names as text. That is
deliberate and safe — vendor logos are trademarks with usage rules, and
several partner programmes require approval before you display their
marks. Check each programme's brand guidelines before swapping in images.

---

## The paywall

**It is off, and off is the default.** Both tools return their full
results free to everyone. Nothing needs changing to keep it that way.

The gate lives server-side in `netlify/functions/report.js`, never in the
browser, so paid content cannot be reached by inspecting the page.

To switch it on later, set these in Netlify -> Site settings ->
Environment variables. No code changes:

```
PAYWALL_ENABLED     true
STRIPE_SECRET_KEY   sk_live_...   (test with sk_test_ first)
STRIPE_PRICE_ID     price_...
SITE_ORIGIN         https://tnbcg.tech
```

---

## Domain and SEO

Everything — canonical tags, Open Graph URLs, the sitemap, robots.txt —
points at `https://tnbcg.tech`. That is correct **if** this site is
replacing the WordPress install currently on that domain.

Until you make that switch, `tnbcg.netlify.app` is telling Google its
content belongs to `tnbcg.tech`, where a different site is live. That is
the right instruction for a staging URL and stops the two competing, but
it does mean the Netlify URL will not rank on its own. If you want it
indexed in its own right instead, find-and-replace `https://tnbcg.tech`
with the real address across all files, including `sitemap.xml` and
`robots.txt`.

On cutover day: point the domain at Netlify, confirm HTTPS is issued,
then submit `https://tnbcg.tech/sitemap.xml` in Google Search Console.

**In place:** canonical, Open Graph and Twitter cards on all nine pages;
JSON-LD covering Organization, ProfessionalService with a service
catalogue, and WebSite; a sitemap with lastmod dates; robots.txt
excluding `/thank-you/` and `/.netlify/`; `noindex` on the thank-you and
404 pages; a complete favicon set and web manifest.

---

## One thing to be careful with

`netlify.toml` sets HSTS. I deliberately left it at a short `max-age` with
**no** `preload` flag, because preload is close to irreversible — browsers
ship the list baked in, and if HTTPS breaks on any subdomain, visitors get
a hard block that takes months to undo. Once `tnbcg.tech` has served
cleanly over HTTPS here for a few weeks, step it up to the full
`max-age=31536000; includeSubDomains; preload`. The file says the same.

The Content-Security-Policy allows `'unsafe-inline'` for scripts because
the tool pages use inline `<script>`. If those ever move to external
files, drop that directive — it is the one weak point in an otherwise
strong policy.

---

## What changed in this pass

- **Fixed: horizontal scrolling on phones.** The Get help section was a
  hard two-column grid with no breakpoint and pushed the page wider than
  the viewport. Now verified clean across 90 page/width combinations from
  320px up.
- **Fixed: broken desktop header.** The nav carried a duplicate "Book a
  free assessment" button that rendered alongside the header one, and the
  header inherited a 1240px cap, so wider screens gave it no extra room —
  the nav shrank and its links spilled over the phone number. The header
  now has its own width cap, the nav no longer shrinks, and the secondary
  links appear only where there is room.
- Full SEO metadata and JSON-LD added across all pages.
- Favicon set completed from `assets/mark.png`, strokes thickened at 16
  and 32px so the circuit detail survives.
- Sitemap given lastmod dates; robots.txt tightened.
- HSTS made reversible.

Fonts load from Google Fonts (Saira, Barlow, IBM Plex Mono). I could not
reach that host while testing, so every layout check ran with substitute
faces that are *wider* than the real ones. The layout passes in the harder
condition, which means it has margin to spare with the real fonts — but
give the header a quick look on the live deploy anyway.

The original v5 notes are kept as `docs-v5-original-readme.md`.
