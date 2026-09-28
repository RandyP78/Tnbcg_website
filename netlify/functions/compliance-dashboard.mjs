import { json, err } from '../../lib/compliance/db.mjs';
import { requireUser, scopeOrg, handle } from '../../lib/compliance/auth.mjs';
import { scoreOrg } from '../../lib/compliance/data.mjs';
import { catalog } from '../../lib/compliance/catalog.mjs';

// GET /api/compliance/dashboard?org=<id>   (clients: org param optional/ignored)
// GET /api/compliance/catalog
export const config = { path: ['/api/compliance/dashboard', '/api/compliance/catalog'] };

export default handle(async (req) => {
  const url = new URL(req.url);
  if (url.pathname.endsWith('/catalog')) return json(catalog, 200, { 'cache-control': 'public, max-age=300' });
  if (req.method !== 'GET') return err('GET only', 405);
  const user = await requireUser(req);
  const orgId = scopeOrg(user, url.searchParams.get('org'));
  const { org, devices, latestByDevice, answers, overrides, evidence, score } = await scoreOrg(orgId);
  // Clients never see other orgs; strip blob keys from evidence index
  const ev = evidence.map(({ blob_key, ...e }) => e);
  return json({ user: { email: user.email, role: user.role }, org, devices: devices.map(d => ({ ...d, lastScan: latestByDevice[d.id] || null })), answers, overrides, evidence: ev, score });
});
