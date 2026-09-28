import { timingSafeEqual } from 'node:crypto';
import { sql } from './db.mjs';
import { requireGate } from './gate.mjs';

/** Agent auth: shared enrollment key in X-Agent-Key (env TEKNIK_AGENT_KEY). */
export function requireAgent(req) {
  const provided = req.headers.get('x-agent-key') || '';
  const expected = process.env.TEKNIK_AGENT_KEY || '';
  if (!expected) throw Object.assign(new Error('Server missing TEKNIK_AGENT_KEY'), { status: 500 });
  const a = Buffer.from(provided), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw Object.assign(new Error('Invalid agent key'), { status: 401 });
}

/**
 * Resolve the Netlify Identity user from the request's bearer token.
 * The browser talks to GoTrue directly at /.netlify/identity (same origin — no third-party
 * script, which keeps the site's strict CSP intact), so the token always arrives here as
 * `Authorization: Bearer <access_token>` and we verify it against Identity itself.
 */
export async function currentUser(req) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const r = await fetch(`${base}/.netlify/identity/user`, { headers: { authorization: auth } });
  if (!r.ok) return null;
  const g = await r.json();
  const meta = g.app_metadata || {};
  const roles = meta.roles || [];
  const isAdmin = roles.includes('admin');
  let orgId = meta.org_id || null;
  if (!orgId && !isAdmin) {
    // Fallback mapping, so an org can be assigned without editing Identity metadata by hand.
    const rows = await sql`select org_id from org_users where identity_sub = ${g.id} or lower(email) = lower(${g.email}) limit 1`;
    orgId = rows[0]?.org_id || null;
  }
  return { sub: g.id, email: g.email, roles, isAdmin, orgId, role: isAdmin ? 'admin' : 'client' };
}

export async function requireUser(req) {
  const u = await currentUser(req);
  if (!u) throw Object.assign(new Error('Sign in required'), { status: 401 });
  // Admin sessions must also carry a valid gate cookie — two independent factors.
  if (u.isAdmin) requireGate(req);
  try { await sql`update org_users set last_login = now() where identity_sub = ${u.sub}`; } catch { /* non-fatal */ }
  return u;
}

export async function requireAdmin(req) {
  const u = await requireUser(req);
  if (!u.isAdmin) throw Object.assign(new Error('Admin role required'), { status: 403 });
  return u;
}

/** Returns the org the caller may act on: admins pass ?org=<id>; clients are pinned to their own org. */
export function scopeOrg(user, requestedOrgId) {
  if (user.isAdmin) { if (!requestedOrgId) throw Object.assign(new Error('org parameter required'), { status: 400 }); return requestedOrgId; }
  if (!user.orgId) throw Object.assign(new Error('Your account is not linked to a client organization yet. Contact TEKNIK.'), { status: 403 });
  if (requestedOrgId && requestedOrgId !== user.orgId) throw Object.assign(new Error('Forbidden'), { status: 403 });
  return user.orgId;
}

export function handle(fn) {
  return async (req, context) => {
    try { return await fn(req, context); }
    catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      return new Response(JSON.stringify({ error: e.message || 'Server error', ...(e.gate ? { gate: true } : {}) }),
        { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
  };
}
