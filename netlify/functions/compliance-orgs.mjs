import { admin, sendRecoveryEmail, findUserByEmail } from '../../lib/compliance/identity.mjs';
import { sql, json, err, audit } from '../../lib/compliance/db.mjs';
import { requireAdmin, handle } from '../../lib/compliance/auth.mjs';
import { scoreOrg } from '../../lib/compliance/data.mjs';

// Admin only.
// GET    /api/compliance/orgs                 list with device counts + last scan
// GET    /api/compliance/orgs/:id/score       quick score for the list view
// PATCH  /api/compliance/orgs/:id             { name?, industry?, frameworks?, prepared_for?, contact_email? }
// POST   /api/compliance/orgs/:id/invite      { email, role: client|admin }  -> creates/links Identity user, sends reset mail
// GET    /api/compliance/orgs/:id/audit       audit trail (last 500)
// GET    /api/compliance/orgs/:id/scans?device=  scan history
export const config = { path: ['/api/compliance/orgs', '/api/compliance/orgs/:id', '/api/compliance/orgs/:id/:action'] };

export default handle(async (req, context) => {
  const user = await requireAdmin(req);
  const { id, action } = context.params || {};
  const url = new URL(req.url);

  if (req.method === 'GET' && !id) {
    const rows = await sql`
      select o.*, (select count(*) from devices d where d.org_id = o.id)::int as device_count,
             (select max(received_at) from scans s where s.org_id = o.id) as last_scan,
             (select count(*) from overrides v where v.org_id = o.id and v.revoked_at is null and not v.approved)::int as pending_overrides,
             (select count(*) from answers a where a.org_id = o.id and a.superseded_at is null)::int as answered
      from orgs o order by o.name`;
    return json(rows);
  }
  if (!id) return err('id required');

  if (req.method === 'GET' && action === 'score') {
    const { score } = await scoreOrg(id);
    return json({ overall: score.overall, technical: score.technical.score, administrative: score.administrative, frameworks: score.frameworks, gaps: score.gaps.length });
  }
  if (req.method === 'GET' && action === 'audit') {
    return json(await sql`select * from audit_log where org_id = ${id} order by at desc limit 500`);
  }
  if (req.method === 'GET' && action === 'scans') {
    const dev = url.searchParams.get('device');
    const rows = dev
      ? await sql`select id, device_id, received_at, agent_version, ran_as_admin, summary from scans where org_id = ${id} and device_id = ${dev} order by received_at desc limit 50`
      : await sql`select id, device_id, received_at, agent_version, ran_as_admin, summary from scans where org_id = ${id} order by received_at desc limit 200`;
    return json(rows);
  }
  if (req.method === 'GET' && action === 'users') {
    return json(await sql`select * from org_users where org_id = ${id} order by email`);
  }
  if (req.method === 'PATCH' && !action) {
    const b = await req.json();
    const [row] = await sql`update orgs set
        name = coalesce(${b.name ?? null}, name), industry = coalesce(${b.industry ?? null}, industry),
        frameworks = coalesce(${b.frameworks ?? null}, frameworks), prepared_for = coalesce(${b.prepared_for ?? null}, prepared_for),
        contact_email = coalesce(${b.contact_email ?? null}, contact_email), updated_at = now()
      where id = ${id} returning *`;
    if (!row) return err('Not found', 404);
    await audit({ actor: user.email, role: 'admin', orgId: id, action: 'org.update', detail: b, req });
    return json(row);
  }
  if (req.method === 'POST' && action === 'invite') {
    const b = await req.json();
    const email = String(b.email || '').trim().toLowerCase();
    const role = b.role === 'admin' ? 'admin' : 'client';
    if (!email.includes('@')) return err('email required');
    let u = await findUserByEmail(email);
    const meta = role === 'admin' ? { roles: ['admin'] } : { roles: ['client'], org_id: id };
    if (!u) {
      u = await admin.createUser({ email, password: crypto.randomUUID() + crypto.randomUUID(), data: { app_metadata: meta } });
    } else {
      await admin.updateUser(u.id, { app_metadata: meta });
    }
    await sendRecoveryEmail(email);
    await sql`insert into org_users (identity_sub, email, org_id, role) values (${u.id}, ${email}, ${role === 'admin' ? null : id}, ${role})
              on conflict (identity_sub) do update set org_id = excluded.org_id, role = excluded.role, email = excluded.email`;
    await audit({ actor: user.email, role: 'admin', orgId: id, action: 'user.invite', target: email, detail: { role }, req });
    return json({ ok: true, userId: u.id, email, role, note: 'A password-setup e-mail was sent. If it does not arrive, use Netlify Identity → Send recovery.' }, 201);
  }
  return err('Unsupported', 405);
});
