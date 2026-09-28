import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { sql, json, err, audit } from '../../lib/compliance/db.mjs';
import { requireUser, scopeOrg, handle } from '../../lib/compliance/auth.mjs';
import { controlsById } from '../../lib/compliance/catalog.mjs';

// POST   /api/compliance/evidence          multipart/form-data: file, control_id, org?, device_id?, description, attest=1
// GET    /api/compliance/evidence/:id      download (org-scoped)
// DELETE /api/compliance/evidence/:id      soft delete (uploader or admin)
export const config = { path: ['/api/compliance/evidence', '/api/compliance/evidence/:id'] };
const MAX = 4.5 * 1024 * 1024;
const ALLOWED = /^(application\/pdf|image\/(png|jpeg|gif|webp)|text\/(plain|csv)|application\/(zip|json|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel))$/;

export default handle(async (req, context) => {
  const user = await requireUser(req);
  const id = context.params?.id;
  const store = getStore('evidence');

  if (req.method === 'POST') {
    const form = await req.formData();
    const file = form.get('file');
    const controlId = form.get('control_id');
    const orgId = scopeOrg(user, form.get('org'));
    if (!file || typeof file === 'string') return err('file required');
    if (!controlsById[controlId]) return err('Unknown control');
    if (form.get('attest') !== '1') return err('You must confirm the file contains no patient or cardholder data');
    const type = file.type || 'application/octet-stream';
    if (!ALLOWED.test(type)) return err(`File type ${type} not accepted (PDF, images, Office, CSV, TXT, ZIP)`);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX) return err('File too large (limit 4.5 MB)', 413);
    if (bytes.length === 0) return err('Empty file');
    const sha = createHash('sha256').update(bytes).digest('hex');
    const key = `${orgId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`;
    await store.set(key, bytes, { metadata: { org: orgId, control: controlId, sha256: sha, by: user.email } });
    const deviceId = form.get('device_id') || null;
    const [row] = await sql`insert into evidence (org_id, device_id, control_id, source, filename, content_type, size_bytes, sha256, blob_key, description, uploaded_by)
      values (${orgId}, ${deviceId}, ${controlId}, ${user.role}, ${file.name}, ${type}, ${bytes.length}, ${sha}, ${key}, ${form.get('description') || null}, ${user.email}) returning id, filename, control_id, size_bytes, sha256, uploaded_at`;
    await audit({ actor: user.email, role: user.role, orgId, action: 'evidence.upload', target: controlId, detail: { id: row.id, sha256: sha, bytes: bytes.length }, req });
    return json(row, 201);
  }

  if (!id) return err('id required');
  const [row] = await sql`select * from evidence where id = ${id} and deleted_at is null`;
  if (!row) return err('Not found', 404);
  scopeOrg(user, row.org_id); // throws for cross-org access by clients

  if (req.method === 'GET') {
    const blob = await store.get(row.blob_key, { type: 'arrayBuffer' });
    if (!blob) return err('Blob missing', 410);
    await audit({ actor: user.email, role: user.role, orgId: row.org_id, action: 'evidence.download', target: row.id, req });
    return new Response(blob, { headers: { 'content-type': row.content_type, 'content-disposition': `attachment; filename="${row.filename.replace(/"/g, '')}"`, 'x-sha256': row.sha256, 'cache-control': 'private, no-store' } });
  }
  if (req.method === 'DELETE') {
    if (!user.isAdmin && row.uploaded_by !== user.email) return err('Forbidden', 403);
    await sql`update evidence set deleted_at = now() where id = ${id}`;
    await audit({ actor: user.email, role: user.role, orgId: row.org_id, action: 'evidence.delete', target: row.id, req });
    return json({ ok: true });
  }
  return err('Unsupported', 405);
});
