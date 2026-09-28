# TEKNIK — website v5

Static site with two free tools, built for Netlify. No build step, no dependencies, no database.

---

## Deploy in two minutes

**Drag and drop.** Zip the contents of this folder (not the folder itself) and drop it on the Netlify dashboard. Functions and redirects are picked up automatically from `netlify.toml`.

**Or connect Git**, which is better once you're iterating:

```
git init && git add . && git commit -m "TEKNIK site v5"
```

Push to GitHub, connect the repo in Netlify. Build command: none. Publish directory: `.`

Then in Netlify → Forms, confirm the `contact` form appears after the first deploy, and add a notification email so submissions actually reach someone.

---

## What's here

```
index.html                     Homepage
404.html                       Not found
thank-you/                     Form success page (form redirects here)
tools/                         Tools hub
  email-security/              SPF / DKIM / DMARC checker
  m365-hardening/              Microsoft 365 self-assessment
privacy/  terms/  accessibility/
assets/
  tools.css  pages.css         Styles
  logo-teknik.png              Header logo (navy + blue)
  logo-teknik-white.png        Footer logo (reversed)
  mark.png  mark-white.png     The circuit mark on its own
  favicon-32.png  apple-touch-icon.png  icon-512.png
  og-image.png                 Social share card
netlify/functions/
  email-security.js            Passive DNS lookups (public, free)
  report.js                    Deep remediation report — THE PAYWALL GATE
  create-checkout.js           Stripe Checkout (dormant)
netlify.toml                   Redirects, security headers, CSP
robots.txt  sitemap.xml  site.webmanifest
```

---

## The paywall

**It is off.** `PAYWALL_ENABLED` is unset, so `report.js` returns the full report to everyone and `create-checkout.js` returns 404. The tools show a "Free while we test" badge. That's the test phase you asked for.

### Turning it on later

You do these steps — they involve your Stripe account and live keys.

1. Stripe dashboard → create a Product, e.g. "IT Security Remediation Report", one-time price. $19–$49 is the sensible band: low enough to be an impulse buy, high enough to filter out people who were never going to engage.
2. Copy the Price ID (`price_...`).
3. Netlify → Site settings → Environment variables:

   | Variable | Value |
   |---|---|
   | `PAYWALL_ENABLED` | `true` |
   | `STRIPE_SECRET_KEY` | `sk_live_...` (test with `sk_test_` first) |
   | `STRIPE_PRICE_ID` | `price_...` |
   | `SITE_ORIGIN` | `https://your-domain.com` |

4. Redeploy. No code changes.

Test with `sk_test_` and card `4242 4242 4242 4242` before going live.

### Why the gate is server-side

`report.js` verifies the Stripe session before returning any content. The paid material never reaches the browser unpaid. Client-side gating — a hidden div, a `localStorage` flag — is bypassed in seconds, and for a company selling cybersecurity, being caught doing that would undo a lot of work.

---

## Before you promote the tools

**Add rate limiting to `email-security.js`.** Netlify functions are stateless so there is none by default. Use Netlify's function rate limiting or a small Upstash counter keyed on IP. Ten requests per minute is plenty.

**Fix your own DMARC first.** At the time of writing, `tnbcg.com` publishes two DMARC records. Under RFC 7489, more than one means receivers treat the domain as having no DMARC policy at all — so both records say `p=reject` and neither is enforced. Merge them into one. A prospect who runs your own checker against you should see an A.

`tnbcg.tech` has no MX, SPF or DMARC. If it never sends mail, publish a null MX, `v=spf1 -all`, and a `p=reject` DMARC record so it can't be spoofed.

---

## Still to do

**Placeholders.** Search the HTML for `class="ph"` — they render with a gold highlight so they can't be shipped by accident. Remaining: business hours, onboarding duration, assessment duration, reply time, and the dates and bracketed items in the legal pages.

**Client portal link.** Three `href="#"` links need your branded FlexPoint URL — header, contact block, footer.

**Partner logos.** The partner grid uses styled text. Swap in the white vendor logos you already have; that section is dark specifically so they drop straight in. Check each vendor's brand guidelines for permitted use and tier language first.

**Legal review.** `privacy/` and `terms/` are accurate about what the site technically does, which is the part templates get wrong. They are not legal advice. The limitation of liability clause in particular should be drafted or approved by counsel.

**Inner pages.** Navigation currently uses on-page anchors. As the service, industry and compliance pages from the copy deck ship, swap the anchors for real URLs and add them to `sitemap.xml`.

**Content Security Policy.** `script-src` allows `'unsafe-inline'` because the tool pages use inline `<script>`. When you move to a build step, extract those and drop it — it's the one weak point in the policy.

**Analytics.** None installed. Add GA4 with form submissions and `tel:` clicks as conversion events, or you won't know which pages generate calls. If you do, list it in the privacy policy before it goes live.

---

## Domain

Your email is `@tnbcg.com` but the site is `tnbcg.tech`. If you own the `.com`, that's the stronger domain and this rebuild is the cheapest moment you'll ever have to switch. Set it as primary in Netlify and 301 the `.tech` across. Update `canonical`, `og:url`, `sitemap.xml` and `robots.txt` if you do.
