import { getDatabase } from '@netlify/database';

let _db;
export function db() {
  if (!_db) _db = getDatabase();          // Netlify DB (Neon). Uses NETLIFY_DATABASE_URL automatically.
  return _db;
}
export const sql = (...args) => db().sql(...args);

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}
export function err(message, status = 400, extra = {}) { return json({ error: message, ...extra }, status); }

export async function audit({ actor, role, orgId, action, target, detail, req }) {
  try {
    const ip = req?.headers?.get('x-nf-client-connection-ip') || req?.headers?.get('x-forwarded-for') || null;
    await sql`insert into audit_log (actor, actor_role, org_id, action, target, detail, ip)
              values (${actor}, ${role || null}, ${orgId || null}, ${action}, ${target || null}, ${detail ? JSON.stringify(detail) : null}, ${ip})`;
  } catch (e) { console.error('audit_log insert failed', e); }
}

export const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 64) || 'client';
