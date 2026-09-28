/* Begins Microsoft admin consent.

   Note the scopes: `offline_access` is deliberately ABSENT. Without it
   Microsoft issues no refresh token, so there is nothing long-lived for
   an attacker to steal from us. Do not add it for convenience. */

import { randomUUID } from 'node:crypto';
import { seal, cookieHeader, pkcePair } from '../../lib/session.mjs';

const SCOPES = [
  'https://graph.microsoft.com/Policy.Read.All',
  'https://graph.microsoft.com/Policy.ReadWrite.ConditionalAccess',
  'https://graph.microsoft.com/Directory.Read.All',
  'https://graph.microsoft.com/Organization.Read.All',
  'openid', 'profile',
].join(' ');

export async function handler(event) {
  const clientId = process.env.ENTRA_CLIENT_ID;
  const origin = process.env.SITE_ORIGIN;
  if (!clientId || !origin) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OAuth is not configured.' }) };
  }

  const { verifier, challenge } = pkcePair();
  const state = randomUUID();

  // The verifier and CSRF state ride in the encrypted cookie, never in the URL.
  const session = seal({ state, verifier, stage: 'pending' }, { ttlSeconds: 900 });

  const url = new URL('https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', `${origin}/.netlify/functions/oauth-callback`);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'admin_consent');

  return {
    statusCode: 302,
    headers: { Location: url.toString(), 'Set-Cookie': cookieHeader(session, { maxAge: 900 }) },
    body: '',
  };
}
