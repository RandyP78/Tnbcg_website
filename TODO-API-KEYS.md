# TODO — the only things left before the AI remediation runs

Everything else is built and tested (51 tests). These are the gaps.

## 1. Environment variables — Netlify → Site settings → Environment variables

    SESSION_SECRET        random, 48+ chars. Rotating it signs everyone out.
    ANTHROPIC_API_KEY     the planner will not run without it
    ENTRA_CLIENT_ID       from the Entra app registration
    ENTRA_CLIENT_SECRET   from the same registration
    SITE_ORIGIN           https://tnbcg.tech

Optional:

    CLAUDE_MODEL          defaults to claude-sonnet-5
    GODADDY_API_KEY       only if you enable the DNS operations
    GODADDY_API_SECRET

Generate a session secret:

    node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"

Never commit these. Never paste them into a chat.

## 2. Entra app registration  (yours — this is the long pole)

Multi-tenant (`AzureADMultipleOrgs`). Redirect URI:

    https://tnbcg.tech/.netlify/functions/oauth-callback

Delegated permissions:

    Policy.Read.All
    Policy.ReadWrite.ConditionalAccess
    Directory.Read.All
    Organization.Read.All

**Do not add `offline_access`.** Its absence is why no refresh token is
ever issued, and therefore why this site never holds standing access to
anyone's tenant.

Then complete **publisher verification**. Without it the consent screen
warns users the publisher is unverified — fatal for a security vendor
asking for admin rights. Requires a Microsoft Partner Network ID. Start
this first; nothing ships until it clears.

## 3. Still to build (code, not config)

- The browser UI that walks the customer through approve-each-step.
  Without it none of these endpoints are reachable from the site.
- A "explain the results" pass so Claude summarises what changed.
- Move the rate limiter to shared storage (see lib/ratelimit.mjs — the
  in-memory counter is per serverless instance and resets unpredictably).
- Decide the GoDaddy authorisation story: the API key identifies TEKNIK,
  not the customer, so DNS operations only work on domains in an account
  you control unless customers supply their own key.

## 4. Before pointing it at a real tenant

Test on a throwaway Microsoft 365 developer tenant, including rollback,
and deliberately run a Conditional Access operation against a tenant with
no break-glass account to confirm it refuses.
