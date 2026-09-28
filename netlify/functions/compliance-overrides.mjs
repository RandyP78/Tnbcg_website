import { sql, json, err, audit } from '../../lib/compliance/db.mjs';
import { requireUser, scopeOrg, handle } from '../../lib/compliance/auth.mjs';
import { controlsById } from '../../lib/compliance/catalog.mjs';

// POST   /api/compliance/overrides                 { org?, device_id?, control_id, status: na|pass|fail, justification, expires_at? }
// POST   /api/compliance/overrides/:id/approve     (admin)
// DELETE /api/compliance/overrides/:id             (revoke; clients may revoke their own pending ones)
export const config = { path: ['/api/compliance/overrides', '/api/compliance/overrides/:id', '/api/compliance/overrides/:id/approve'] };

export default handle(async (req, context) => {
  const user = await requireUser(req);
  const id = context.params?.id;
  const url = new URL(req.url);

  if (req.method === 'POST' && !id) {
    const b = await req.json();
    const orgId = scopeOrg(user, b.org);
    if (!controlsById[b.control_id]) return err('Unknown control');
    if (!['na', 'pass', 'fail'].includes(b.status)) return err('status must be na|pass|fail');
    if (!user.isAdmin && b.status !== 'na') return err('Clients may only mark controls Not Applicable; TEKNIK reviews and approves.', 403);
    if (!(b.justification || '').trim() || b.justification.trim().length < 15) return err('Justification (≥ 15 characters) is required');
    if (b.device_id) { const [d] = await sql`select 1 from devices where id = ${b.device_id} and org_id = ${orgId}`; if (!d) return err('Device not in this organization'); }
    // one active override per (org, device, control): revoke the previous one
    await sql`update overrides set revoked_at = now() where org_id = ${orgId} and control_id = ${b.control_id} and device_id is not distinct from ${b.device_id || null} and revoked_at is null`;
    const [row] = await sql`insert into overrides (org_id, device_id, control_id, status, justification, set_by, set_by_role, approved, approved_by, expires_at)
      values (${orgId}, ${b.device_id || null}, ${b.control_id}, ${b.status}, ${b.justification.trim()}, ${user.email}, ${user.role}, ${user.isAdmin}, ${user.isAdmin ? user.email : null}, ${b.expires_at || null}) returning *`;
    await audit({ actor: user.email, role: user.role, orgId, action: 'override.create', target: b.control_id, detail: { id: row.id, status: b.status, device: b.device_id || null, autoApproved: user.isAdmin }, req });
    return json(row, 201);
  }

  if (req.method === 'POST' && url.pathname.endsWith('/approve')) {
    if (!user.isAdmin) return err('Admin only', 403);
    const [row] = await sql`update overrides set approved = true, approved_by = ${user.email} where id = ${id} and revoked_at is null returning *`;
    if (!row) return err('Not found', 404);
    await audit({ actor: user.email, role: 'admin', orgId: row.org_id, action: 'override.approve', target: row.control_id, detail: { id: row.id }, req });
    return json(row);
  }

  if (req.method === 'DELETE' && id) {
    const [row] = await sql`select * from overrides where id = ${id} and revoked_at is null`;
    if (!row) return err('Not found', 404);
    if (!user.isAdmin && (row.org_id !== user.orgId || row.approved)) return err('Only TEKNIK can revoke an approved override', 403);
    await sql`update overrides set revoked_at = now() where id = ${id}`;
    await audit({ actor: user.email, role: user.role, orgId: row.org_id, action: 'override.revoke', target: row.control_id, detail: { id: row.id }, req });
    return json({ ok: true });
  }
  return err('Unsupported', 405);
});
