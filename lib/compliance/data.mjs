import { sql } from './db.mjs';
import { catalog } from './catalog.mjs';
import { computeScore } from './scoring.mjs';

/** Loads everything the scoring engine and portals need for one org. */
export async function loadOrg(orgId) {
  const [org] = await sql`select * from orgs where id = ${orgId}`;
  if (!org) throw Object.assign(new Error('Organization not found'), { status: 404 });
  const devices = await sql`select * from devices where org_id = ${orgId} order by hostname`;
  const latest = await sql`select distinct on (device_id) id, device_id, received_at, summary, agent_version, ran_as_admin
                           from scans where org_id = ${orgId} order by device_id, received_at desc`;
  const scanIds = latest.map(s => s.id);
  const findings = scanIds.length
    ? await sql`select scan_id, device_id, control_id, status, observed, expected, detail from findings where scan_id = any(${scanIds})`
    : [];
  const findingsByDevice = {};
  for (const f of findings) (findingsByDevice[f.device_id] ||= []).push(f);
  const answers = await sql`select * from answers where org_id = ${orgId} and superseded_at is null`;
  const overrides = await sql`select * from overrides where org_id = ${orgId} and revoked_at is null order by created_at desc`;
  const evidence = await sql`select e.*, d.hostname from evidence e left join devices d on d.id = e.device_id
                             where e.org_id = ${orgId} and e.deleted_at is null order by e.uploaded_at desc`;
  const latestByDevice = Object.fromEntries(latest.map(s => [s.device_id, s]));
  return { org, devices, latestByDevice, findingsByDevice, answers, overrides, evidence };
}

export async function scoreOrg(orgId) {
  const data = await loadOrg(orgId);
  const score = computeScore({ catalog, org: data.org, devices: data.devices, findingsByDevice: data.findingsByDevice, answers: data.answers, overrides: data.overrides });
  return { ...data, score };
}
