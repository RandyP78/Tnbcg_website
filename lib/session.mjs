/* ============================================================
   Session handling.

   THE DESIGN RULE: this system never holds standing access to a
   customer tenant. Concretely:

     - we do NOT request the `offline_access` scope, so Microsoft never
       issues us a refresh token. There is nothing long-lived to steal.
     - the short-lived access token lives only inside an encrypted,
       httpOnly cookie on the customer's own browser. Our servers store
       nothing. When it expires (~60-90 min) the run is over and they
       sign in again.

   If you ever add `offline_access` to get a smoother UX, understand
   what you are trading: tnbcg.tech becomes a vault holding persistent
   admin access to every tenant that ever used the tool, and a breach of
   a marketing site becomes a breach of every customer simultaneously.

   Plan tokens exist so the apply endpoint cannot be driven with an
   arbitrary operation id. The plan is signed at planning time; apply
   verifies the signature and refuses anything not inside it.
   ============================================================ */

import crypto from 'node:crypto';

const ALG = 'aes-256-gcm';
export const SESSION_COOKIE = '__Host-tk_session';

function key(secret = process.env.SESSION_SECRET) {
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function seal(payload, { secret, ttlSeconds = 3600 } = {}) {
  const body = JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, key(secret), iv);
  const enc = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map(b => b.toString('base64url')).join('.');
}

export function unseal(token, { secret } = {}) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, enc] = parts.map(p => Buffer.from(p, 'base64url'));
    const d = crypto.createDecipheriv(ALG, key(secret), iv);
    d.setAuthTag(tag);
    const out = Buffer.concat([d.update(enc), d.final()]).toString('utf8');
    const parsed = JSON.parse(out);
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null; // tampered, wrong key, or malformed
  }
}

/* ---------- plan tokens ---------- */

export function signPlan(ids, { secret = process.env.SESSION_SECRET, ttlSeconds = 1800 } = {}) {
  const payload = { ids: [...ids].sort(), exp: Date.now() + ttlSeconds * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', key(secret)).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyPlan(token, { secret = process.env.SESSION_SECRET } = {}) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', key(secret)).update(body).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* ---------- snapshot tokens ---------- */

/**
 * The snapshot travels to the browser and back so the two halves of the
 * plan flow can each fit inside a function timeout. Signing it means a
 * caller cannot invent tenant state — e.g. claiming a break-glass
 * account exists when it does not.
 */
export function signSnapshot(snapshot, { secret = process.env.SESSION_SECRET, ttlSeconds = 1800 } = {}) {
  const body = Buffer.from(JSON.stringify({ snapshot, exp: Date.now() + ttlSeconds * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', key(secret)).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySnapshot(token, { secret = process.env.SESSION_SECRET } = {}) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', key(secret)).update(body).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed.snapshot;
  } catch {
    return null;
  }
}

/* ---------- cookies ---------- */

export function cookieHeader(value, { maxAge = 3600 } = {}) {
  // __Host- prefix requires Secure, Path=/ and no Domain attribute.
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readCookie(headers = {}) {
  const raw = headers.cookie || headers.Cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return v.join('=');
  }
  return null;
}

/* ---------- PKCE ---------- */

export function pkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
