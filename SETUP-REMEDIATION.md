# Wiring it up

## Environment variables (Netlify → Site settings → Environment variables)

    SESSION_SECRET        random, 48+ chars. Rotating it logs everyone out.
    ENTRA_CLIENT_ID       from the Entra app registration
    ENTRA_CLIENT_SECRET   from the same registration
    SITE_ORIGIN           https://tnbcg.tech
    ANTHROPIC_API_KEY     for the planner
    CLAUDE_MODEL          optional, defaults to claude-sonnet-5
    GODADDY_API_KEY       only if using the DNS operations
    GODADDY_API_SECRET

Generate a secret:

    node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"

## Entra app registration

Redirect URI (Web):

    https://tnbcg.tech/.netlify/functions/oauth-callback

Delegated permissions:

    Policy.Read.All
    Policy.ReadWrite.ConditionalAccess
    Directory.Read.All
    Organization.Read.All

**Do not add `offline_access`.** Its absence is why we never receive a
refresh token, and therefore never hold standing access to anyone's
tenant. Adding it would turn this site into a credential vault.

Set `signInAudience` to `AzureADMultipleOrgs`, then complete publisher
verification — without it the consent screen shows an unverified-publisher
warning, which for a security vendor asking for admin rights will destroy
conversion.

## The flow

    GET  /.netlify/functions/oauth-start      → Microsoft admin consent
    GET  /.netlify/functions/oauth-callback   → sets the encrypted cookie
    POST /.netlify/functions/remediate-plan   → { summary, steps[], planToken }
    POST /.netlify/functions/remediate-apply  → one operation per call

`remediate-apply` takes `{ id, planToken, breakGlassIds }` and runs a
single operation. Call it once per approved step; the browser drives the
loop. This is not a workaround — Netlify's standard functions time out at
10 seconds, and per-item calls match the per-item approval the customer
already gave.

## Verified by tests

    npm test        # 41 tests

Access tokens are encrypted in the cookie, not merely encoded. Tampered
sessions, wrong-key sessions and expired sessions are all rejected.
Plan tokens are HMAC-signed: adding an operation id to one invalidates it.
The apply endpoint refuses any id outside the signed plan, refuses a
missing session, and refuses a forged token.

## Not yet built

- The browser UI that drives the approval loop
- The GoDaddy customer-authorisation story. The API key identifies
  TEKNIK, not the customer, so DNS operations only work on domains in an
  account you control — or the customer supplies their own key. Decide
  which before shipping the DNS half.
- Exchange Online operations (separate consent path)
- The emailed report and undo bundle

## Before pointing this at a real tenant

Test against a throwaway Microsoft 365 developer tenant first, including
the rollback path, and deliberately run a Conditional Access operation on
a tenant with no break-glass account to confirm it refuses.
