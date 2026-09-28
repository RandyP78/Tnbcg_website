import { json, err, audit } from '../../lib/compliance/db.mjs';
import { requireAdmin, handle } from '../../lib/compliance/auth.mjs';
import { catalog } from '../../lib/compliance/catalog.mjs';
import { scoreOrg } from '../../lib/compliance/data.mjs';
import { buildRemediationScript } from '../../lib/compliance/scoring.mjs';

// Admin only. GET /api/compliance/remediation?org=<id>[&device=<id>][&controls=EP-01,NET-03][&include=fail,warn]
// Returns a downloadable .ps1 built from the catalog's best-practice snippets for the failing controls.
export const config = { path: '/api/compliance/remediation' };

export default handle(async (req) => {
  if (req.method !== 'GET') return err('GET only', 405);
  const user = await requireAdmin(req);
  const url = new URL(req.url);
  const orgId = url.searchParams.get('org'); if (!orgId) return err('org required');
  const deviceId = url.searchParams.get('device');
  const include = (url.searchParams.get('include') || 'fail,warn').split(',');
  const { org, devices, score } = await scoreOrg(orgId);
  let ids;
  if (url.searchParams.get('controls')) ids = url.searchParams.get('controls').split(',').map(s => s.trim()).filter(Boolean);
  else if (deviceId) {
    const dc = score.technical.deviceControls[deviceId]; if (!dc) return err('Device not found', 404);
    ids = Object.entries(dc).filter(([, r]) => include.includes(r.status)).map(([id]) => id);
  } else ids = score.controls.filter(r => r.type === 'automated' && include.includes(r.status)).map(r => r.id);
  // severity order
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  const byId = Object.fromEntries(catalog.controls.map(c => [c.id, c]));
  ids = [...new Set(ids)].filter(i => byId[i]).sort((a, b) => order[byId[a].severity] - order[byId[b].severity]);
  const hostname = deviceId ? devices.find(d => d.id === deviceId)?.hostname : null;
  const script = buildRemediationScript({ catalog, controlIds: ids, clientName: org.name, hostname });
  await audit({ actor: user.email, role: 'admin', orgId, action: 'remediation.generate', target: hostname || 'org', detail: { controls: ids }, req });
  const fname = `TEKNIK-Remediate-${org.slug}${hostname ? '-' + hostname : ''}.ps1`;
  if (url.searchParams.get('format') === 'json') return json({ controls: ids, script, filename: fname });
  return new Response(script, { headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': `attachment; filename="${fname}"`, 'cache-control': 'no-store' } });
});
