import { json, err } from '../../lib/compliance/db.mjs';
import { sql } from '../../lib/compliance/db.mjs';
import { handle } from '../../lib/compliance/auth.mjs';
import { GATE_COOKIE, GATE_TTL_SECONDS, signGate, verifyGate, readCookie, gateCookieHeader, passwordMatches } from '../../lib/compliance/gate.mjs';

// POST   /api/compliance/admin-gate   { password }  -> sets the signed gate cookie
// GET    /api/compliance/admin-gate                 -> { ok } if the current cookie is valid
// DELETE /api/compliance/admin-gate                 -> clears it
export const config = { path: '/api/compliance/admin-gate' };

export default handle(async (req) => {
  const secret = process.env.TEKNIK_ADMIN_GATE_PASSWORD;
  if (!secret) return err('Admin gate is not configured on this site', 503);

  if (req.method === 'GET') return json({ ok: verifyGate(readCookie(req, GATE_COOKIE), secret) });

  if (req.method === 'DELETE') {
    return json({ ok: true }, 200, { 'set-cookie': gateCookieHeader('', 0) });
  }

  if (req.method !== 'POST') return err('POST only', 405);

  const body = await req.json().catch(() => ({}));
  const ip = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || null;

  if (!passwordMatches(body.password, secret)) {
    // Slow the guesser down and leave a trail. Netlify's own rate limiting sits in front of this.
    await new Promise(r => setTimeout(r, 700));
    try {
      await sql`insert into audit_log (actor, actor_role, action, target, detail, ip)
                values (${'anonymous'}, ${'gate'}, ${'admin.gate.deny'}, ${'/compliance/admin'}, ${JSON.stringify({ ua: req.headers.get('user-agent') || null })}, ${ip})`;
    } catch { /* audit is best-effort; never block on it */ }
    return err('Incorrect password.', 401);
  }

  const exp = Math.floor(Date.now() / 1000) + GATE_TTL_SECONDS;
  try {
    await sql`insert into audit_log (actor, actor_role, action, target, detail, ip)
              values (${'anonymous'}, ${'gate'}, ${'admin.gate.allow'}, ${'/compliance/admin'}, ${JSON.stringify({ expires: new Date(exp * 1000).toISOString() })}, ${ip})`;
  } catch { /* best-effort */ }
  return json({ ok: true, expires: new Date(exp * 1000).toISOString() }, 200,
    { 'set-cookie': gateCookieHeader(signGate(exp, secret), GATE_TTL_SECONDS) });
});
