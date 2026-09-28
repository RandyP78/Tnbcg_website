import { sql, json, err, audit } from '../../lib/compliance/db.mjs';
import { requireUser, scopeOrg, handle } from '../../lib/compliance/auth.mjs';
import { controlsById } from '../../lib/compliance/catalog.mjs';

// PUT /api/compliance/answers   body: { org?, control_id, answer: yes|partial|no|na, notes }
export const config = { path: '/api/compliance/answers' };

export default handle(async (req) => {
  if (req.method !== 'PUT' && req.method !== 'POST') return err('PUT only', 405);
  const user = await requireUser(req);
  const b = await req.json();
  const orgId = scopeOrg(user, b.org);
  const c = controlsById[b.control_id];
  if (!c || c.type !== 'manual') return err('Unknown manual control');
  if (!['yes', 'partial', 'no', 'na'].includes(b.answer)) return err('answer must be yes|partial|no|na');
  if (b.answer === 'na' && !(b.notes || '').trim()) return err('A justification is required for N/A');
  await sql`update answers set superseded_at = now() where org_id = ${orgId} and control_id = ${b.control_id} and superseded_at is null`;
  const [row] = await sql`insert into answers (org_id, control_id, answer, notes, answered_by) values (${orgId}, ${b.control_id}, ${b.answer}, ${b.notes || null}, ${user.email}) returning *`;
  await audit({ actor: user.email, role: user.role, orgId, action: 'answer.set', target: b.control_id, detail: { answer: b.answer }, req });
  return json(row, 201);
});
