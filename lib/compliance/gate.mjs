/**
 * Admin gate — shared-secret pre-authentication for /compliance/admin.
 *
 * This is the FIRST of two independent factors on the admin console:
 *   1. this gate password (enforced at the edge, before the HTML is served, and again on every admin API call)
 *   2. Netlify Identity login with the `admin` role (enforced server-side in lib/compliance/auth.mjs)
 *
 * The cookie carries only an expiry and an HMAC of it. Rotating TEKNIK_ADMIN_GATE_PASSWORD
 * invalidates every outstanding gate cookie, because the password is the HMAC key.
 *
 * Node (Functions) implementation. The Deno/edge twin lives in
 * netlify/edge-functions/compliance-admin-gate.js — keep the two in sync.
 */
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

export const GATE_COOKIE = 'tk_admin_gate';
export const GATE_TTL_SECONDS = 12 * 60 * 60;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function signGate(exp, secret) {
  return `${exp}.${b64url(createHmac('sha256', secret).update(String(exp)).digest())}`;
}

export function verifyGate(value, secret) {
  if (!value || !secret) return false;
  const dot = value.lastIndexOf('.');
  if (dot < 1) return false;
  const exp = Number(value.slice(0, dot));
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = signGate(exp, secret);
  const a = Buffer.from(value), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function readCookie(req, name) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function gateCookieHeader(value, maxAge) {
  return `${GATE_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

/** Constant-time password compare that does not leak length. */
export function passwordMatches(provided, expected) {
  const salt = randomBytes(16);
  const h = (s) => createHmac('sha256', salt).update(String(s ?? '')).digest();
  return timingSafeEqual(h(provided), h(expected));
}

/**
 * Throws 401/503 unless the request carries a valid gate cookie.
 * Fails CLOSED: if TEKNIK_ADMIN_GATE_PASSWORD is unset, admin access is refused
 * rather than silently unprotected.
 */
export function requireGate(req) {
  const secret = process.env.TEKNIK_ADMIN_GATE_PASSWORD;
  if (!secret) throw Object.assign(new Error('Admin console is not configured: set TEKNIK_ADMIN_GATE_PASSWORD in the Netlify site environment.'), { status: 503 });
  if (!verifyGate(readCookie(req, GATE_COOKIE), secret)) throw Object.assign(new Error('Admin gate password required'), { status: 401, gate: true });
}
