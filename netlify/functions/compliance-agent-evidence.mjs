import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { sql, json, err, audit } from '../../lib/compliance/db.mjs';
import { requireAgent, handle } from '../../lib/compliance/auth.mjs';

export const config = { path: '/api/compliance/agent-evidence' };
const MAX = 4.5 * 1024 * 1024;

export default handle(async (req) => {
  if (req.method !== 'POST') return err('POST only', 405);
  requireAgent(req);
  const b = await req.json();
  if (!b?.scanId || !b?.dataBase64 || !b?.filename) return err('scanId, filename, dataBase64 required');
  const [scan] = await sql`select id, org_id, device_id from scans where id = ${b.scanId}`;
  if (!scan) return err('Unknown scan', 404);
  const bytes = Buffer.from(b.dataBase64, 'base64');
  if (bytes.length > MAX) return err('Evidence too large (limit 4.5 MB)', 413);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const key = `${scan.org_id}/${crypto.randomUUID()}-${b.filename.replace(/[^\w.-]/g, '_')}`;
  await getStore('evidence').set(key, bytes, { metadata: { org: scan.org_id, scan: scan.id, sha256: sha } });
  const controls = Array.isArray(b.controls) && b.controls.length ? b.controls : ['*'];
  const ids = [];
  for (const c of controls) {
    const [row] = await sql`insert into evidence (org_id, device_id, scan_id, control_id, source, filename, content_type, size_bytes, sha256, blob_key, description, uploaded_by)
      values (${scan.org_id}, ${scan.device_id}, ${scan.id}, ${c}, 'agent', ${b.filename}, ${b.contentType || 'application/octet-stream'}, ${bytes.length}, ${sha}, ${key}, ${b.description || null}, 'agent') returning id`;
    ids.push(row.id);
  }
  await audit({ actor: 'agent', role: 'agent', orgId: scan.org_id, action: 'evidence.upload', target: key, detail: { scan: scan.id, controls: controls.length, sha256: sha, bytes: bytes.length }, req });
  return json({ ok: true, evidenceId: ids[0], records: ids.length, sha256: sha }, 201);
});
