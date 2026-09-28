// Builds a realistic fake org dataset + report for UI smoke tests.
import { writeFileSync } from 'node:fs';
import { computeScore } from '../lib/compliance/scoring.mjs';
import { catalog } from '../lib/compliance/catalog.mjs';
const auto = catalog.controls.filter(c => c.type === 'automated'), manual = catalog.controls.filter(c => c.type === 'manual');
const org = { id: 'org-1', slug: 'sunrise-pediatrics', name: 'Sunrise Pediatrics, PLLC', contact_email: 'office@sunrisepeds.example', industry: 'healthcare', frameworks: ['hipaa','pci','csf','n171','cis'], prepared_for: null, created_at: '2026-08-01T00:00:00Z' };
const devices = [
  { id: 'd1', hostname: 'FRONTDESK-01', os_name: 'Microsoft Windows 11 Pro', os_version: '24H2', os_build: '26100.4652', manufacturer: 'Dell', model: 'OptiPlex 7020', serial: 'ABC123', domain_join: 'entra', last_user: 'AzureAD\\maria', last_seen: '2026-09-05T14:02:00Z', first_seen: '2026-09-05T14:02:00Z' },
  { id: 'd2', hostname: 'EXAM-ROOM-2', os_name: 'Microsoft Windows 10 Pro', os_version: '22H2', os_build: '19045.5011', manufacturer: 'HP', model: 'ProDesk 400', serial: 'XYZ789', domain_join: 'workgroup', last_user: 'EXAM-ROOM-2\\nurse', last_seen: '2026-09-05T14:10:00Z', first_seen: '2026-09-05T14:10:00Z' },
  { id: 'd3', hostname: 'BILLING-LT', os_name: 'Microsoft Windows 11 Pro', os_version: '23H2', os_build: '22631.5189', manufacturer: 'Lenovo', model: 'ThinkPad T14', serial: 'LNV456', domain_join: 'entra', last_user: 'AzureAD\\billing', last_seen: '2026-09-05T14:20:00Z', first_seen: '2026-09-05T14:20:00Z' }
];
const fails = { d1: ['IAM-11','LOG-01','NET-05','HARD-05','EP-06'], d2: ['PATCH-01','ENC-01','EP-03','IAM-01','IAM-16','NET-03','LOG-01','LOG-05','DATA-01','DATA-04','IAM-15'], d3: ['PATCH-01','IAM-11','EP-06','DATA-01'] };
const warns = { d1: ['HARD-03','PATCH-03'], d2: ['HARD-03','IAM-14','NET-09'], d3: ['LOG-02','HARD-11'] };
const obs = { 'ENC-01': 'OS drive FullyDecrypted (0%), protection Off', 'PATCH-01': 'Microsoft Windows 10 Pro 22H2 (build 19045) — Windows 10 reached end of support 14 Oct 2025. Override to N/A only if ESU-enrolled.', 'IAM-11': 'No enforced inactivity lock (InactivityTimeoutSecs=, policy=/, MDM=)', 'NET-03': 'SMBv1 ENABLED (server=True, feature=Enabled)' };
const findingsByDevice = {};
for (const d of devices) findingsByDevice[d.id] = auto.map(c => {
  const st = fails[d.id].includes(c.id) ? 'fail' : warns[d.id].includes(c.id) ? 'warn' : (c.id === 'HARD-09' && d.domain_join !== 'domain') ? 'na' : 'pass';
  const f = { control_id: c.id, status: st, observed: obs[c.id] || (st === 'pass' ? 'Configured as expected' : 'Not configured'), expected: c.title };
  if (c.id === 'DATA-01') f.detail = { stats: { scannedFiles: 18422, skippedLarge: 12, unreadable: 31, flaggedFiles: st === 'fail' ? 7 : 0, identifierFiles: st === 'fail' ? 4 : 0, mailArchives: d.id === 'd2' ? [{ path: 'C:\\Users\\nurse\\Documents\\Outlook Files\\archive.pst', sizeMB: 2140 }] : [], timedOut: false, roots: ['C:\\Users\\' + d.last_user.split('\\')[1], 'C:\\Users\\Public'] },
    top: st === 'fail' ? [{ path: `C:\\Users\\${d.last_user.split('\\')[1]}\\Desktop\\patient list 2025.xlsx`, sizeKB: 214, modified: '2026-03-04T00:00:00Z', owner: d.last_user, hits: { SSN: 61, DOB: 58, MRN: 61 }, clinicalTerms: 9, identifier: true, sample: 'SSN *******4321' }, { path: `C:\\Users\\${d.last_user.split('\\')[1]}\\Downloads\\EOB_march.pdf`, sizeKB: 88, modified: '2026-05-11T00:00:00Z', owner: d.last_user, hits: { MedicareMBI: 2, InsuranceID: 3 }, clinicalTerms: 6, identifier: true, sample: 'MedicareMBI *******AA11' }] : [] };
  return f;
});
const answers = manual.slice(0, 18).map((c, i) => ({ control_id: c.id, answer: ['yes','yes','partial','no','yes','na'][i % 6], notes: i % 6 === 5 ? 'No card-present payments are accepted; all payments via hosted processor.' : i % 6 === 3 ? 'Tabletop never performed.' : 'Policy on file in SharePoint.', answered_by: 'office@sunrisepeds.example', answered_at: '2026-09-04T16:00:00Z' }));
const overrides = [ { id: 1, control_id: 'HARD-11', device_id: null, status: 'na', justification: 'Line-of-business app requires WSH; compensated by ASR rules.', set_by: 'randy.pena@tnbcg.com', set_by_role: 'admin', approved: true, approved_by: 'randy.pena@tnbcg.com', created_at: '2026-09-05T00:00:00Z' },
  { id: 2, control_id: 'PATCH-01', device_id: 'd3', status: 'na', justification: 'Replacement laptop ordered, delivery 9/20.', set_by: 'office@sunrisepeds.example', set_by_role: 'client', approved: false, created_at: '2026-09-05T18:00:00Z' } ];
const evidence = [ { id: 'e1', control_id: '*', source: 'agent', filename: 'evidence-FRONTDESK-01-20260905-100200.zip', size_bytes: 148223, sha256: 'ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12', uploaded_by: 'agent', uploaded_at: '2026-09-05T14:02:30Z', hostname: 'FRONTDESK-01' },
  { id: 'e2', control_id: 'ADM-11', source: 'client', filename: 'BAA-BillingVendor-2026.pdf', description: 'Signed BAA', size_bytes: 402311, sha256: 'ff12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12', uploaded_by: 'office@sunrisepeds.example', uploaded_at: '2026-09-04T16:30:00Z' } ];
const score = computeScore({ catalog, org, devices, findingsByDevice, answers, overrides });
const latestByDevice = Object.fromEntries(devices.map(d => [d.id, { id: 's-' + d.id, received_at: d.last_seen, agent_version: '1.0.0', ran_as_admin: d.id !== 'd2' }]));
const dashboard = { user: { email: 'randy.pena@tnbcg.com', role: 'admin' }, org, devices: devices.map(d => ({ ...d, lastScan: latestByDevice[d.id] })), answers, overrides, evidence, score };
const report = { id: 'a1b2c3d4-0000-4000-8000-000000000001', org_id: org.id, generated_by: 'randy.pena@tnbcg.com', generated_at: '2026-09-06T15:00:00Z', catalog_version: catalog.version, score, narrative: null, narrative_model: null, org, catalog: { version: catalog.version, frameworks: catalog.frameworks, issuer: catalog.issuer } };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify({ catalog, dashboard, report, orgs: [{ ...org, device_count: 3, last_scan: '2026-09-05T14:20:00Z', pending_overrides: 1, answered: 18 }] }));
console.log('overall', score.overall, 'tech', score.technical.score, 'admin', score.administrative.score, 'gaps', score.gaps.length, JSON.stringify(score.frameworks));
