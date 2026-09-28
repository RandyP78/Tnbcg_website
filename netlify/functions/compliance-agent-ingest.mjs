import { admin, sendRecoveryEmail, findUserByEmail } from '../../lib/compliance/identity.mjs';
import { sql, json, err, audit, slugify } from '../../lib/compliance/db.mjs';
import { requireAgent, handle } from '../../lib/compliance/auth.mjs';
import { controlsById } from '../../lib/compliance/catalog.mjs';

export const config = { path: '/api/compliance/agent-ingest' };

const VALID = new Set(['pass', 'fail', 'warn', 'error', 'na']);

export default handle(async (req) => {
  if (req.method !== 'POST') return err('POST only', 405);
  requireAgent(req);
  const p = await req.json();
  if (!p?.client?.name || !p?.client?.email || !p?.device?.machineGuid || !Array.isArray(p.findings)) return err('Malformed payload');
  const email = String(p.client.email).trim().toLowerCase();
  const name = String(p.client.name).trim();
  const slug = slugify(name);

  // 1. org (auto-register on first check-in)
  let [org] = await sql`select * from orgs where slug = ${slug}`;
  let created = false;
  if (!org) {
    [org] = await sql`insert into orgs (slug, name, contact_email) values (${slug}, ${name}, ${email}) returning *`;
    created = true;
  } else if (org.contact_email !== email) {
    await sql`update orgs set contact_email = ${email}, updated_at = now() where id = ${org.id}`;
  }

  // 2. device
  const d = p.device;
  const [device] = await sql`
    insert into devices (org_id, hostname, machine_guid, os_name, os_version, os_build, manufacturer, model, serial, domain_join, last_user, last_seen)
    values (${org.id}, ${d.hostname}, ${d.machineGuid}, ${d.osName}, ${d.osVersion}, ${d.osBuild}, ${d.manufacturer}, ${d.model}, ${d.serial}, ${d.domainJoin}, ${d.lastUser}, now())
    on conflict (org_id, machine_guid) do update set hostname = excluded.hostname, os_name = excluded.os_name, os_version = excluded.os_version,
      os_build = excluded.os_build, manufacturer = excluded.manufacturer, model = excluded.model, serial = excluded.serial,
      domain_join = excluded.domain_join, last_user = excluded.last_user, last_seen = now()
    returning *`;

  // 3. scan + findings (unknown control IDs are kept in raw but not scored)
  const [scan] = await sql`
    insert into scans (org_id, device_id, agent_version, catalog_version, started_at, finished_at, ran_as_admin, summary, raw)
    values (${org.id}, ${device.id}, ${p.agentVersion || '?'}, ${p.catalogVersion || '?'}, ${p.startedAt}, ${p.finishedAt}, ${!!p.ranAsAdmin}, ${JSON.stringify(p.summary || {})}, ${JSON.stringify(p)})
    returning id`;
  let inserted = 0;
  for (const f of p.findings) {
    if (!controlsById[f.control] || !VALID.has(f.status)) continue;
    await sql`insert into findings (scan_id, device_id, org_id, control_id, status, observed, expected, detail)
              values (${scan.id}, ${device.id}, ${org.id}, ${f.control}, ${f.status}, ${f.observed || null}, ${f.expected || null}, ${f.detail == null ? null : JSON.stringify(f.detail)})`;
    inserted++;
  }

  // 4. make sure the client contact has a portal login (invite = create + recovery e-mail). Best-effort.
  let invite = 'existing';
  try {
    const [mapped] = await sql`select 1 from org_users where lower(email) = ${email}`;
    if (!mapped) {
      const existing = await findUserByEmail(email);
      let user = existing;
      if (!user) {
        const pw = crypto.randomUUID() + crypto.randomUUID();
        user = await admin.createUser({ email, password: pw, data: { app_metadata: { roles: ['client'], org_id: org.id }, user_metadata: { full_name: name } } });
        await sendRecoveryEmail(email);
        invite = 'created';
      } else if (!(user.roles || []).includes('admin')) {
        await admin.updateUser(user.id, { app_metadata: { roles: ['client'], org_id: org.id } }).catch(() => {});
        invite = 'linked';
      }
      await sql`insert into org_users (identity_sub, email, org_id, role) values (${user.id}, ${email}, ${org.id}, ${(user.roles || []).includes('admin') ? 'admin' : 'client'})
                on conflict (identity_sub) do update set org_id = excluded.org_id`;
    }
  } catch (e) { console.warn('identity provisioning skipped:', e.message); invite = 'skipped: ' + e.message; }

  await audit({ actor: `agent:${d.hostname}`, role: 'agent', orgId: org.id, action: 'scan.ingest', target: scan.id, detail: { device: device.id, findings: inserted, orgCreated: created, invite }, req });
  return json({ ok: true, orgId: org.id, orgCreated: created, deviceId: device.id, scanId: scan.id, findings: inserted, invite, portalUrl: `${process.env.URL}/compliance/portal/` }, 201);
});
