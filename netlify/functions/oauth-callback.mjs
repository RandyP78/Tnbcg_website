/* Exchanges the authorization code for a short-lived access token and
   stores it in the encrypted cookie. Nothing is written to any database. */

import { seal, unseal, readCookie, cookieHeader, clearCookieHeader } from '../../lib/session.mjs';

export async function handler(event) {
  const params = event.queryStringParameters || {};
  const cookie = readCookie(event.headers || {});
  const session = unseal(cookie);

  if (params.error) {
    return redirect(`/tools/m365-hardening/?consent=denied`);
  }
  if (!session || session.stage !== 'pending') {
    return redirect('/tools/m365-hardening/?consent=expired');
  }
  // CSRF: the state in the URL must match the one sealed in our cookie.
  if (!params.state || params.state !== session.state) {
    return { statusCode: 400, headers: { 'Set-Cookie': clearCookieHeader() }, body: 'Invalid state.' };
  }
  if (!params.code) return redirect('/tools/m365-hardening/?consent=nocode');

  const body = new URLSearchParams({
    client_id: process.env.ENTRA_CLIENT_ID,
    client_secret: process.env.ENTRA_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: `${process.env.SITE_ORIGIN}/.netlify/functions/oauth-callback`,
    code_verifier: session.verifier,
  });

  const res = await fetch('https://login.microsoftonline.com/organizations/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    return redirect('/tools/m365-hardening/?consent=failed');
  }
  const token = await res.json();

  // Cookie lifetime tracks the token's own lifetime. When it lapses the
  // run is simply over — there is no refresh path by design.
  const ttl = Math.max(60, Math.min(Number(token.expires_in) || 3600, 5400));
  const sealed = seal({ stage: 'ready', accessToken: token.access_token }, { ttlSeconds: ttl });

  return {
    statusCode: 302,
    headers: {
      Location: '/tools/m365-hardening/?consent=granted',
      'Set-Cookie': cookieHeader(sealed, { maxAge: ttl }),
    },
    body: '',
  };
}

function redirect(to) {
  return { statusCode: 302, headers: { Location: to, 'Set-Cookie': clearCookieHeader() }, body: '' };
}
