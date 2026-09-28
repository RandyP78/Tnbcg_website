/* ============================================================
   TEKNIK — Stripe Checkout session

   DORMANT DURING THE FREE TEST. While PAYWALL_ENABLED is false this
   returns 404 and is never called by the front end.

   TO SWITCH THE PAYWALL ON (you do these steps, not me — they
   involve your Stripe account and live API keys):

     1. In the Stripe dashboard, create a Product, e.g.
        "IT Security Remediation Report", one-time price.
        Suggested: $19–$49. Low enough to be an impulse purchase,
        high enough to filter out tyre-kickers.
     2. Copy the Price ID (starts with price_).
     3. In Netlify → Site settings → Environment variables, add:
          STRIPE_SECRET_KEY   sk_live_...  (or sk_test_ first)
          STRIPE_PRICE_ID     price_...
          PAYWALL_ENABLED     true
          SITE_ORIGIN         https://your-domain.com
     4. Redeploy. Nothing in the code changes.

   Test with sk_test_ and card 4242 4242 4242 4242 before going live.
   ============================================================ */

const PAYWALL_ENABLED = String(process.env.PAYWALL_ENABLED).toLowerCase() === 'true';

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

  if (!PAYWALL_ENABLED) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Paywall is disabled. Reports are free.' }) };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const key = process.env.STRIPE_SECRET_KEY;
  const price = process.env.STRIPE_PRICE_ID;
  const origin = process.env.SITE_ORIGIN || `https://${event.headers.host}`;

  if (!key || !price) {
    console.error('Missing STRIPE_SECRET_KEY or STRIPE_PRICE_ID');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Checkout is not configured.' }) };
  }

  let tool = 'email';
  try { tool = JSON.parse(event.body || '{}').tool === 'm365' ? 'm365' : 'email'; } catch { /* default */ }

  const returnPath = tool === 'm365' ? '/tools/m365-hardening/' : '/tools/email-security/';

  const params = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    success_url: `${origin}${returnPath}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${returnPath}?checkout=cancelled`,
    'metadata[tool]': tool,
  });

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const session = await res.json();
    if (!res.ok) {
      console.error('Stripe error', session && session.error && session.error.message);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not start checkout.' }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error('checkout failure', err);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not start checkout.' }) };
  }
};
