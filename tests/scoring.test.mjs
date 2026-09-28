import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScore, buildRemediationScript } from '../lib/compliance/scoring.mjs';
import { catalog } from '../lib/compliance/catalog.mjs';
const auto = catalog.controls.filter(c => c.type === 'automated');
const manual = catalog.controls.filter(c => c.type === 'manual');
const org = { id: 'o1', name: 'Test Clinic', frameworks: ['hipaa', 'pci', 'csf', 'n171', 'cis'] };
const dev = (id, host) => ({ id, hostname: host, os_name: 'Windows 11 Pro', last_seen: new Date().toISOString() });

test('all pass + all yes = 100 / A', () => {
  const s = computeScore({ catalog, org, devices: [dev('d1', 'WS1')], findingsByDevice: { d1: auto.map(c => ({ control_id: c.id, status: 'pass' })) }, answers: manual.map(c => ({ control_id: c.id, answer: 'yes' })) });
  assert.equal(s.overall.score, 100); assert.equal(s.overall.grade, 'A'); assert.equal(s.gaps.length, 0);
});
test('critical fail caps score', () => {
  const f = auto.map(c => ({ control_id: c.id, status: c.id === 'ENC-01' ? 'fail' : 'pass' }));
  const s = computeScore({ catalog, org, devices: [dev('d1', 'WS1')], findingsByDevice: { d1: f }, answers: manual.map(c => ({ control_id: c.id, answer: 'yes' })) });
  assert.ok(s.overall.capped); assert.equal(s.overall.score, 69); assert.equal(s.overall.grade, 'D');
  assert.equal(s.gaps[0].id, 'ENC-01');
});
test('approved org override to N/A removes control; pending does not', () => {
  const f = auto.map(c => ({ control_id: c.id, status: c.id === 'ENC-01' ? 'fail' : 'pass' }));
  const base = { catalog, org, devices: [dev('d1', 'WS1')], findingsByDevice: { d1: f }, answers: manual.map(c => ({ control_id: c.id, answer: 'yes' })) };
  const pending = computeScore({ ...base, overrides: [{ control_id: 'ENC-01', device_id: null, status: 'na', approved: false }] });
  assert.ok(pending.overall.capped); assert.equal(pending.pendingOverrides.length, 1);
  const ok = computeScore({ ...base, overrides: [{ control_id: 'ENC-01', device_id: null, status: 'na', approved: true }] });
  assert.equal(ok.overall.score, 100); assert.equal(ok.controls.find(c => c.id === 'ENC-01').status, 'na');
});
test('device-level override beats org-level; worst-of rollup across devices', () => {
  const f = auto.map(c => ({ control_id: c.id, status: 'pass' }));
  const f2 = auto.map(c => ({ control_id: c.id, status: c.id === 'NET-03' ? 'fail' : 'pass' }));
  const s = computeScore({ catalog, org, devices: [dev('d1', 'WS1'), dev('d2', 'WS2')], findingsByDevice: { d1: f, d2: f2 }, answers: [],
    overrides: [{ control_id: 'NET-03', device_id: null, status: 'na', approved: true }, { control_id: 'NET-03', device_id: 'd2', status: 'fail', approved: true }] });
  const row = s.controls.find(c => c.id === 'NET-03');
  assert.equal(row.status, 'fail'); assert.deepEqual(row.byDevice.fail, ['WS2']); assert.deepEqual(row.byDevice.na, ['WS1']);
  assert.equal(s.administrative.score, 0); // nothing answered
});
test('warn = half credit; error excluded; unanswered counts against', () => {
  const f = auto.map(c => ({ control_id: c.id, status: 'warn' }));
  const s = computeScore({ catalog, org, devices: [dev('d1', 'WS1')], findingsByDevice: { d1: f }, answers: [] });
  assert.equal(s.technical.score, 50);
  const e = computeScore({ catalog, org, devices: [dev('d1', 'WS1')], findingsByDevice: { d1: auto.map(c => ({ control_id: c.id, status: 'error' })) }, answers: [] });
  assert.equal(e.technical.score, null);
});
test('framework scoping: HIPAA-only org ignores PCI-only controls', () => {
  const s = computeScore({ catalog, org: { ...org, frameworks: ['hipaa'] }, devices: [], findingsByDevice: {}, answers: manual.map(c => ({ control_id: c.id, answer: 'yes' })) });
  assert.ok(!s.controls.find(c => c.id === 'PCI-01')); assert.ok(s.controls.find(c => c.id === 'ADM-14')); assert.ok(!s.frameworks.pci);
});
test('remediation script builds and includes manual items', () => {
  const s = buildRemediationScript({ catalog, controlIds: ['NET-03', 'ENC-03', 'IAM-11'], clientName: "O'Brien Dental", hostname: 'WS1' });
  assert.match(s, /Step 'NET-03'/); assert.match(s, /\$manual \+= "ENC-03/); assert.match(s, /param\(\[switch\]\$Apply\)/);
});
test('catalog integrity: every control has frameworks, severity, remediation; automated have check keys', () => {
  const ids = new Set();
  for (const c of catalog.controls) {
    assert.ok(!ids.has(c.id), 'dup ' + c.id); ids.add(c.id);
    assert.ok(['critical', 'high', 'medium', 'low'].includes(c.severity), c.id);
    assert.ok(c.remediation?.summary, c.id + ' remediation');
    if (c.type === 'automated') assert.ok(c.check, c.id + ' check'); else assert.ok(c.question, c.id + ' question');
  }
});
